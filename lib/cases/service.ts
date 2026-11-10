// The case flow, start to finish. This is the only file that connects the pieces:
//   buyer message -> agent (read-only facts) -> engine (outcome) -> guardrails (allowed?)
//   -> executor (the only thing that can move money).
// Nothing the agent writes is trusted for amounts or outcomes.

import OpenAI from 'openai';
import { db, schema } from '../db';
import type { CaseStatus } from '../db/schema';
import { simulatedCarrier, type ShipmentInfo } from '../carrier/simulated';
import { CHAT_MODEL, runAgent, type AgentClient, type AgentResult, type TranscriptEntry } from '../agent/run';
import type { Assessment } from '../agent/assessment';
import { safeReply } from '../agent/safety';
import type { AgentContext, ToolTrace } from '../agent/tools';
import { eq } from 'drizzle-orm';
import { formatUsd, type Cents } from '../money';
import { executeRefund, refundRequestId } from '../paypal/executor';
import { getLiveOrder, type LiveOrder } from '../paypal/orders';
import { getSettings } from '../settings-store';
import { getPolicy } from '../store/policy';
import { elasticConfigured, findSimilarCases, hybridPolicy, indexCase } from '../search/elastic';
import { emitZapierEvent } from '../notify/zapier';
import { DISPUTE_NOTE, ESCALATION_NOTE, FALLBACK_QUESTION, holdMessage, REVIEW_NOTE, WAITING_NOTE } from './copy';
import { describeOffer, FALLBACK_BUYER_MESSAGE, planCase, replacementCost, type OfferView } from './plan';
import * as repo from './repo';

export type ChatMessage = {
  id: string;
  role: 'buyer' | 'agent' | 'seller';
  body: string;
  hasImage: boolean;
  createdAt: string;
};

export type ChatState = {
  caseId: string;
  status: CaseStatus;
  messages: ChatMessage[];
  offer: OfferView | null;
  refund: { id: string; amountCents: Cents } | null;
  // The tools the agent used on this turn, shown while the buyer waits.
  trace: ToolTrace[];
};

export class ChatError extends Error {
  constructor(
    readonly code: 'not_found' | 'bad_request' | 'unavailable',
    message: string,
  ) {
    super(message);
  }
}

const MAX_IMAGE_CHARS = 4_000_000;
const MAX_TEXT_CHARS = 2_000;

// Works with any OpenAI-compatible endpoint: set OPENAI_BASE_URL to point elsewhere.
let openai: OpenAI | undefined;
const defaultClient = (): AgentClient => (openai ??= new OpenAI({ timeout: 30_000, maxRetries: 1 }));

// Buyers prove an order is theirs with the order number plus the payer's email. Both failures
// look the same, so the form cannot be used to probe which order numbers exist.
async function verifyBuyer(paypalOrderId: string, email: string) {
  const order = await repo.findOrder(paypalOrderId.trim());
  if (!order || order.payerEmail.trim().toLowerCase() !== email.trim().toLowerCase()) {
    throw new ChatError('not_found', "We couldn't find an order with that number and email.");
  }
  return order;
}

async function buildState(c: repo.CaseRow, order: repo.OrderRow, trace: ToolTrace[] = []): Promise<ChatState> {
  const [rows, offer, refund] = await Promise.all([repo.caseMessages(c.id), pendingOffer(c, order), c.status === 'resolved' ? repo.refundForCase(c.id) : null]);
  return {
    caseId: c.id,
    status: c.status,
    messages: rows.map((m) => ({
      id: m.id,
      role: m.role,
      body: m.body,
      hasImage: Boolean(m.attachmentUrl),
      createdAt: m.createdAt.toISOString(),
    })),
    offer,
    refund,
    trace,
  };
}

// An offer is on the table when the latest decision may run automatically and the buyer has
// not yet answered it. Once they do, the case moves on and the offer disappears.
async function pendingOffer(c: repo.CaseRow, order: repo.OrderRow): Promise<OfferView | null> {
  if (c.status !== 'waiting_on_buyer') return null;
  const decision = await repo.latestDecision(c.id);
  if (!decision || decision.guardrailResult !== 'auto_execute') return null;
  return describeOffer(decision, replacementCost(order.items).replacementAvailable);
}

function agentContext(order: repo.OrderRow, live: LiveOrder): AgentContext & { shipment: () => Promise<ShipmentInfo | null> } {
  let shipmentCache: Promise<ShipmentInfo | null> | undefined;
  const shipment = () =>
    (shipmentCache ??= (async () => {
      const [row] = await db().select().from(schema.shipments).where(eq(schema.shipments.orderId, order.id));
      return row ? simulatedCarrier.getShipmentStatus(row.trackingNumber) : null;
    })());
  return {
    shipment,
    getShipment: shipment,
    getPolicy: async (topic) => {
      const local = getPolicy(topic);
      const indexed = await hybridPolicy(topic);
      return [...new Set([...local, ...indexed])];
    },
    getBuyerHistory: () => repo.buyerHistory(order.payerEmail),
    ...(elasticConfigured() ? { findSimilarCases } : {}),
    getOrder: async () => ({
      status: live.status,
      placedAt: order.createdAt.toISOString().slice(0, 10),
      items: order.items.map((i) => ({ name: i.name, quantity: i.quantity, unitCents: i.unitCents })),
      totalCents: live.amountCents,
      refundedSoFarCents: live.refundedCents,
    }),
  };
}

async function indexCaseSafely(caseId: string, assessment: Assessment, outcome: string): Promise<void> {
  if (!elasticConfigured()) return;
  try {
    const messages = await repo.caseMessages(caseId);
    await indexCase({
      caseId,
      complaint: messages.map((message) => message.body).join(' '),
      assessment,
      outcome,
      summary: assessment.sellerSummary,
    });
  } catch (error) {
    console.warn('Elastic case indexing skipped', error);
  }
}

const toTranscript = (rows: Awaited<ReturnType<typeof repo.caseMessages>>): TranscriptEntry[] =>
  rows.map((m) => ({
    role: m.role === 'buyer' ? 'buyer' : 'agent',
    body: m.role === 'seller' ? `Message from the shop owner: ${m.body}` : m.body,
    imageDataUrl: m.attachmentUrl,
  }));

export type MessageInput = { orderId: string; email: string; text: string; imageDataUrl?: string | null };

export async function handleBuyerMessage(input: MessageInput, client: AgentClient = defaultClient()): Promise<ChatState> {
  const text = input.text.trim();
  if (!text && !input.imageDataUrl) throw new ChatError('bad_request', 'Write a message or attach a photo.');
  if (text.length > MAX_TEXT_CHARS) throw new ChatError('bad_request', 'That message is too long.');
  if (input.imageDataUrl && input.imageDataUrl.length > MAX_IMAGE_CHARS) throw new ChatError('bad_request', 'That photo is too large.');

  const order = await verifyBuyer(input.orderId, input.email);
  let c = (await repo.openCase(order.id)) ?? (await repo.createCase(order.id));
  await repo.addMessage(c.id, 'buyer', text || '(photo attached)', input.imageDataUrl);

  // While the seller or PayPal has the case, the agent stays out of it.
  if (c.status === 'waiting_on_approval' || c.status === 'processing_approval' || c.status === 'processing_refund' || c.status === 'became_dispute') {
    await repo.addMessage(c.id, 'agent', c.status === 'became_dispute' ? DISPUTE_NOTE : WAITING_NOTE);
    return buildState(c, order);
  }

  const live = await getLiveOrder(order.paypalOrderId);
  const ctx = agentContext(order, live);
  let result: AgentResult;
  try {
    result = await runAgent({ client, ctx, transcript: toTranscript(await repo.caseMessages(c.id)) });
  } catch (err) {
    console.error('Agent failed', err);
    throw new ChatError('unavailable', 'The assistant is unavailable right now. Please try again in a moment.');
  }

  const allowedFromOrder = [live.amountCents, ...order.items.flatMap((i) => [i.unitCents, i.unitCents * i.quantity])];

  if (result.kind === 'reply') {
    const safe = safeReply(result.text, allowedFromOrder, FALLBACK_QUESTION);
    await repo.addMessage(c.id, 'agent', safe.text);
    await repo.updateCase(c.id, { status: 'waiting_on_buyer' });
    c = { ...c, status: 'waiting_on_buyer' };
    return buildState(c, order, result.trace);
  }

  const version = await repo.nextVersion(c.id);

  if (result.kind === 'escalate') {
    await db().insert(schema.assessments).values({ caseId: c.id, version, result: { escalated: true, reason: result.reason }, model: 'none' });
    await repo.addMessage(c.id, 'agent', ESCALATION_NOTE);
    await repo.updateCase(c.id, { status: 'waiting_on_approval', outcome: 'escalated' });
    void emitZapierEvent({
      type: 'case.needs_approval',
      caseId: c.id,
      orderId: order.paypalOrderId,
      amountCents: 0,
      reason: result.reason,
      approvalUrl: `/console?case=${c.id}`,
    });
    c = { ...c, status: 'waiting_on_approval' };
    return buildState(c, order, result.trace);
  }

  const { assessment } = result;
  const [settings, shipment, buyerHistory, autoRefundedTodayCents] = await Promise.all([
    getSettings(),
    ctx.shipment(),
    repo.buyerHistory(order.payerEmail),
    repo.autoRefundedToday(),
  ]);
  const plan = planCase({
    assessment,
    shipment,
    items: order.items,
    live,
    buyerRefundsLast90Days: buyerHistory.refundsLast90Days,
    autoRefundedTodayCents,
    settings,
  });

  await db().insert(schema.assessments).values({
    caseId: c.id,
    version,
    result: { ...assessment, evidenceStrength: plan.evidence },
    model: CHAT_MODEL,
  });
  await db().insert(schema.decisions).values({
    caseId: c.id,
    version,
    options: plan.decision.options,
    chosen: plan.decision.chosen,
    refundCents: plan.decision.refundCents,
    guardrailResult: plan.guardrail.outcome,
    reasons: plan.guardrail.reasons,
    checks: plan.guardrail.checks,
  });

  void indexCaseSafely(c.id, assessment, plan.decision.chosen);

  const needsSeller = plan.guardrail.outcome !== 'auto_execute';
  const offer = describeOffer(plan.decision, replacementCost(order.items).replacementAvailable);
  const status: CaseStatus = needsSeller ? 'waiting_on_approval' : 'waiting_on_buyer';

  const empathy = safeReply(assessment.buyerMessage, plan.allowedAmountsCents, FALLBACK_BUYER_MESSAGE).text;
  const followUp = needsSeller ? REVIEW_NOTE : offer ? 'Here is what I can offer:' : holdMessage(assessment, shipment);
  await repo.addMessage(c.id, 'agent', `${empathy}\n\n${followUp}`);
  await repo.updateCase(c.id, {
    status,
    complaintType: assessment.complaintType,
    outcome: plan.decision.chosen,
    savedVsDefaultCents: plan.decision.savedVsHoldCents,
  });
  if (needsSeller) {
    void emitZapierEvent({
      type: 'case.needs_approval',
      caseId: c.id,
      orderId: order.paypalOrderId,
      amountCents: plan.decision.refundCents,
      reason: plan.guardrail.reasons.join('; ') || 'Decision requires seller review',
      approvalUrl: `/console?case=${c.id}`,
    });
  }
  c = { ...c, status };
  return buildState(c, order, result.trace);
}

export async function syncChat(input: { orderId: string; email: string }): Promise<ChatState | null> {
  const order = await verifyBuyer(input.orderId, input.email);
  const c = await repo.latestCase(order.id);
  return c ? buildState(c, order) : null;
}

export async function respondToOffer(input: {
  orderId: string;
  email: string;
  choice: 'accept' | 'prefer_replacement';
}): Promise<ChatState> {
  const order = await verifyBuyer(input.orderId, input.email);
  const c = await repo.openCase(order.id);
  const offer = c && (await pendingOffer(c, order));
  const decision = c && (await repo.latestDecision(c.id));
  if (!c || !offer || !decision) throw new ChatError('bad_request', 'There is no offer to answer right now.');

  const settings = await getSettings();
  const chooseReplacement = input.choice === 'prefer_replacement' || offer.kind === 'replacement';

  if (!(await repo.claimOffer(c.id))) throw new ChatError('bad_request', 'This offer is already being processed.');
  const releaseOffer = () => repo.updateCase(c.id, { status: 'waiting_on_buyer' });

  try {
    if (chooseReplacement) {
      if (input.choice === 'prefer_replacement' && !offer.canPreferReplacement) {
        throw new ChatError('bad_request', 'A replacement is not available for this order.');
      }
      await repo.addMessage(c.id, 'buyer', 'I would like a replacement.');
      await repo.addMessage(c.id, 'agent', 'Done. The shop owner will send a replacement at no cost and keep you posted here.');
      await repo.updateCase(c.id, { status: 'resolved', outcome: 'replacement', amountRefundedCents: 0 });
      return buildState({ ...c, status: 'resolved' }, order);
    }

    await repo.addMessage(c.id, 'buyer', 'I accept the offer.');

  // Rebuild the plan from the latest PayPal facts and settings. The offer may have been sitting
  // in the chat while the seller changed limits, another refund was issued, or the capture changed.
  const live = await getLiveOrder(order.paypalOrderId);
  const latestAssessment = await repo.latestAssessment(c.id);
  const assessment = latestAssessment?.result as Assessment | undefined;
  const shipment = await agentContext(order, live).shipment();
  const [buyerHistory, autoRefundedTodayCents] = assessment
    ? await Promise.all([repo.buyerHistory(order.payerEmail), repo.autoRefundedToday()])
    : [{ refundsLast90Days: 0 }, 0];
  const currentPlan = assessment
    ? planCase({
        assessment,
        shipment,
        items: order.items,
        live,
        buyerRefundsLast90Days: buyerHistory.refundsLast90Days,
        autoRefundedTodayCents,
        settings,
      })
    : null;
  const withinLimits = Boolean(
    currentPlan &&
      currentPlan.guardrail.outcome === 'auto_execute' &&
      currentPlan.decision.chosen === decision.chosen &&
      currentPlan.decision.refundCents === decision.refundCents,
  );
  const result = withinLimits
    ? await executeRefund({
        requestId: refundRequestId(c.id, decision.version),
        caseId: c.id,
        paypalOrderId: order.paypalOrderId,
        amountCents: decision.refundCents,
        guardrail: 'auto_execute',
        noteToPayer: 'Refund from Clay & Kiln',
      })
    : ({ ok: false, reason: 'Limits changed since the offer' } as const);

    if (result.ok) {
      void emitZapierEvent({ type: 'refund.issued', caseId: c.id, refundId: result.refundId, amountCents: result.amountCents });
      await repo.addMessage(
        c.id,
        'agent',
        `Done. ${formatUsd(result.amountCents)} is on its way back to your PayPal account. Your refund id is ${result.refundId}.`,
      );
      await repo.updateCase(c.id, { status: 'resolved', outcome: decision.chosen, amountRefundedCents: result.amountCents });
      return buildState({ ...c, status: 'resolved' }, order);
    }

    console.error('Auto refund did not complete:', result.reason);
    await repo.addMessage(c.id, 'agent', `I couldn't finish that automatically, so the shop owner will complete it. ${REVIEW_NOTE}`);
    await repo.updateCase(c.id, { status: 'waiting_on_approval' });
    void emitZapierEvent({
      type: 'case.needs_approval',
      caseId: c.id,
      orderId: order.paypalOrderId,
      amountCents: decision.refundCents,
      reason: result.reason,
      approvalUrl: `/console?case=${c.id}`,
    });
    return buildState({ ...c, status: 'waiting_on_approval' }, order);
  } catch (error) {
    await releaseOffer();
    throw error;
  }
}

// --- Seller actions ---------------------------------------------------------

export type SellerResult = { ok: true; message: string } | { ok: false; reason: string };

export async function approveCase(input: { caseId: string; approvedBy: string; amountCents?: Cents }): Promise<SellerResult> {
  const c = await repo.getCase(input.caseId);
  if (!c || c.status !== 'waiting_on_approval') return { ok: false, reason: 'This case is not waiting for approval.' };
  if (!(await repo.claimApproval(c.id))) return { ok: false, reason: 'Another approval is already being processed for this case.' };
  const release = () => repo.updateCase(c.id, { status: 'waiting_on_approval' });
  const decision = await repo.latestDecision(c.id);
  if (!decision) {
    await release();
    return { ok: false, reason: 'The agent did not produce a decision. Decline it or reply to the buyer.' };
  }
  if (decision.guardrailResult === 'blocked') {
    await release();
    return { ok: false, reason: 'A guardrail blocked this case, so it cannot be approved.' };
  }

  const [order] = await db().select().from(schema.orders).where(eq(schema.orders.id, c.orderId));
  if (!order) {
    await release();
    return { ok: false, reason: 'The order for this case no longer exists.' };
  }
  const override = input.amountCents;
  if (override !== undefined && (!Number.isInteger(override) || override <= 0)) {
    await release();
    return { ok: false, reason: 'Enter a refund amount above zero.' };
  }

  if (decision.chosen === 'replacement') {
    await repo.markApproved(decision.id, input.approvedBy);
    await repo.addMessage(c.id, 'seller', 'Approved. A replacement is on its way.');
    await repo.updateCase(c.id, { status: 'resolved', outcome: 'replacement', amountRefundedCents: 0 });
    return { ok: true, message: 'Approved. Remember to ship the replacement.' };
  }

  const amountCents = override ?? decision.refundCents;
  if (amountCents <= 0) {
    // Nothing to pay (e.g. the policy answer was approved as is): close the case.
    await repo.markApproved(decision.id, input.approvedBy);
    await repo.addMessage(c.id, 'seller', 'The shop owner has reviewed your case and agrees with the answer above.');
    await repo.updateCase(c.id, { status: 'resolved', outcome: decision.chosen, amountRefundedCents: 0 });
    return { ok: true, message: 'Case closed with no payment.' };
  }

  const result = await executeRefund({
    requestId: refundRequestId(c.id, decision.version) + (override === undefined ? '' : `-${override}`),
    caseId: c.id,
    paypalOrderId: order.paypalOrderId,
    amountCents,
    guardrail: decision.guardrailResult,
    approvedBy: input.approvedBy,
    noteToPayer: 'Refund from Clay & Kiln',
  });
  if (!result.ok) {
    await release();
    return { ok: false, reason: result.reason };
  }

  await repo.markApproved(decision.id, input.approvedBy);
  await repo.addMessage(
    c.id,
    'seller',
    `Approved. ${formatUsd(result.amountCents)} is on its way back to your PayPal account. Your refund id is ${result.refundId}.`,
  );
  await repo.updateCase(c.id, { status: 'resolved', outcome: decision.chosen, amountRefundedCents: result.amountCents });
  void emitZapierEvent({ type: 'refund.issued', caseId: c.id, refundId: result.refundId, amountCents: result.amountCents, approvedBy: input.approvedBy });
  return { ok: true, message: `Refunded ${formatUsd(result.amountCents)} (${result.refundId}).` };
}

export async function declineCase(input: { caseId: string; reason?: string }): Promise<SellerResult> {
  const c = await repo.getCase(input.caseId);
  if (!c || c.status !== 'waiting_on_approval') return { ok: false, reason: 'This case is not waiting for approval.' };
  if (!(await repo.claimApproval(c.id))) return { ok: false, reason: 'Another approval action is already being processed for this case.' };
  const reason = input.reason?.trim().slice(0, 500);
  await repo.addMessage(
    c.id,
    'seller',
    reason ? `The shop owner reviewed your case: ${reason}` : 'The shop owner reviewed your case and is unable to offer a refund for this one.',
  );
  await repo.updateCase(c.id, { status: 'resolved', outcome: 'declined', amountRefundedCents: 0 });
  return { ok: true, message: 'Case closed without a refund.' };
}
