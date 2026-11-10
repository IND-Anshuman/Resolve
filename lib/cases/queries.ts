// Read models for the seller console. Data volumes here are small (one shop), so rows are
// joined in code instead of with SQL, which keeps each query easy to read.

import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db';
import type { CaseStatus } from '../db/schema';
import type { GuardrailCheck } from '../engine/guardrails';
import type { OptionCost } from '../engine/decide';
import type { Cents } from '../money';
import { getSettings } from '../settings-store';

export type CaseListRow = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: CaseStatus;
  paypalOrderId: string;
  buyerEmail: string;
  complaintType: string | null;
  outcome: string | null;
  amountAtStakeCents: Cents;
  expectedCostCents: Cents | null;
  savedCents: Cents | null;
  refundedCents: Cents;
  guardrail: 'auto_execute' | 'needs_approval' | 'blocked' | null;
  guardrailReasons: string[];
  proposedRefundCents: Cents;
  summary: string;
  items: string;
};

export async function listCases(): Promise<CaseListRow[]> {
  const rows = await db()
    .select({ c: schema.cases, o: schema.orders })
    .from(schema.cases)
    .innerJoin(schema.orders, eq(schema.cases.orderId, schema.orders.id))
    .orderBy(desc(schema.cases.updatedAt))
    .limit(500);
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.c.id);
  const [decisionRows, assessmentRows] = await Promise.all([
    db().select().from(schema.decisions).where(inArray(schema.decisions.caseId, ids)),
    db().select().from(schema.assessments).where(inArray(schema.assessments.caseId, ids)),
  ]);
  const latest = <T extends { caseId: string; version: number }>(all: T[]) => {
    const byCase = new Map<string, T>();
    for (const row of all) {
      const seen = byCase.get(row.caseId);
      if (!seen || row.version > seen.version) byCase.set(row.caseId, row);
    }
    return byCase;
  };
  const decisions = latest(decisionRows);
  const assessments = latest(assessmentRows);

  return rows.map(({ c, o }) => {
    const d = decisions.get(c.id);
    const a = assessments.get(c.id)?.result as { sellerSummary?: string; reason?: string; escalated?: boolean } | undefined;
    const chosen = d?.options.find((opt) => opt.kind === d.chosen);
    return {
      id: c.id,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      status: c.status,
      paypalOrderId: o.paypalOrderId,
      buyerEmail: o.payerEmail,
      complaintType: c.complaintType,
      outcome: c.outcome,
      amountAtStakeCents: o.amountCents,
      expectedCostCents: chosen?.expectedCostCents ?? null,
      savedCents: c.savedVsDefaultCents,
      refundedCents: c.amountRefundedCents,
      guardrail: d?.guardrailResult ?? null,
      guardrailReasons: d?.reasons ?? [],
      proposedRefundCents: d?.refundCents ?? 0,
      summary: a?.escalated ? `The agent could not assess this case: ${a.reason}` : (a?.sellerSummary ?? 'Waiting for the buyer.'),
      items: o.items.map((i) => i.name).join(', '),
    };
  });
}

export type CaseDetail = {
  messages: { id: string; role: string; body: string; hasImage: boolean; createdAt: string }[];
  decisions: {
    version: number;
    options: OptionCost[];
    chosen: string;
    refundCents: Cents;
    guardrail: string;
    reasons: string[];
    checks: GuardrailCheck[];
    approvedBy: string | null;
  }[];
  actions: { id: string; kind: string; requestId: string; status: string; httpStatus: number | null; request: unknown; response: unknown; createdAt: string }[];
};

export async function getCaseDetail(caseId: string): Promise<CaseDetail> {
  const [messages, decisions, actions] = await Promise.all([
    db().select().from(schema.messages).where(eq(schema.messages.caseId, caseId)).orderBy(schema.messages.createdAt),
    db().select().from(schema.decisions).where(eq(schema.decisions.caseId, caseId)).orderBy(desc(schema.decisions.version)),
    db().select().from(schema.actions).where(eq(schema.actions.caseId, caseId)).orderBy(schema.actions.createdAt),
  ]);
  return {
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      body: m.body,
      hasImage: Boolean(m.attachmentUrl),
      createdAt: m.createdAt.toISOString(),
    })),
    decisions: decisions.map((d) => ({
      version: d.version,
      options: d.options,
      chosen: d.chosen,
      refundCents: d.refundCents,
      guardrail: d.guardrailResult,
      reasons: d.reasons,
      checks: d.checks,
      approvedBy: d.approvedBy,
    })),
    actions: actions.map((a) => ({
      id: a.id,
      kind: a.kind,
      requestId: a.requestId,
      status: a.status,
      httpStatus: a.httpStatus,
      request: a.paypalRequest,
      response: a.paypalResponse,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

export async function getAttachment(messageId: string): Promise<{ mime: string; bytes: Buffer } | null> {
  const [row] = await db().select({ url: schema.messages.attachmentUrl }).from(schema.messages).where(eq(schema.messages.id, messageId));
  const m = row?.url && /^data:(image\/[a-z]+);base64,(.+)$/.exec(row.url);
  return m ? { mime: m[1], bytes: Buffer.from(m[2], 'base64') } : null;
}

export async function recentWebhookEvents(limit = 15) {
  const rows = await db().select().from(schema.webhookEvents).orderBy(desc(schema.webhookEvents.receivedAt)).limit(limit);
  return rows.map((e) => ({ id: e.eventId, type: e.type, verified: e.verified, receivedAt: e.receivedAt.toISOString() }));
}

export type Results = {
  weekly: { week: string; resolved: number; savedDollars: number }[];
  refunds: { kind: 'Automatic' | 'Approved by seller'; count: number; dollars: number }[];
  totals: { resolved: number; becameDispute: number; savedCents: Cents };
  dailyCapCents: Cents;
  dailySpendCents: Cents;
  disputeFeesAvoidedCents: Cents;
  daily: { day: string; refundDollars: number; capDollars: number; feesAvoidedDollars: number }[];
};

const NO_FIX_OUTCOMES = new Set(['declined', 'approval_expired']);

const weekStart = (d: Date) => {
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
};

export async function getResults(): Promise<Results> {
  const [cases, settings] = await Promise.all([listCases(), getSettings()]);
  const resolved = cases.filter((c) => c.status === 'resolved');
  // Closed without a fix: the buyer may still open a dispute, so no fee was avoided.
  const fixed = resolved.filter((c) => !NO_FIX_OUTCOMES.has(c.outcome ?? ''));
  const weeks = new Map<string, { resolved: number; savedCents: number }>();
  for (const c of fixed) {
    const w = weekStart(new Date(c.updatedAt));
    const entry = weeks.get(w) ?? { resolved: 0, savedCents: 0 };
    entry.resolved += 1;
    entry.savedCents += Math.max(0, c.savedCents ?? 0);
    weeks.set(w, entry);
  }

  const refundActions = await db()
    .select({ request: schema.actions.paypalRequest, createdAt: schema.actions.createdAt })
    .from(schema.actions)
    .where(and(eq(schema.actions.kind, 'refund'), eq(schema.actions.status, 'succeeded')));
  const groups = { Automatic: { count: 0, cents: 0 }, 'Approved by seller': { count: 0, cents: 0 } };
  const byDay = new Map<string, number>();
  for (const { request, createdAt } of refundActions) {
    const r = request as { approvedBy?: string; body?: { amount?: { value?: string } } };
    const g = r.approvedBy ? groups['Approved by seller'] : groups.Automatic;
    const cents = Math.round(Number(r.body?.amount?.value ?? 0) * 100);
    g.count += 1;
    g.cents += cents;
    const day = createdAt.toISOString().slice(0, 10);
    if (!r.approvedBy) byDay.set(day, (byDay.get(day) ?? 0) + cents);
  }

  const today = new Date().toISOString().slice(0, 10);
  const dailySpendCents = byDay.get(today) ?? 0;
  const resolvedByDay = new Map<string, number>();
  for (const c of fixed) {
    const day = c.updatedAt.slice(0, 10);
    resolvedByDay.set(day, (resolvedByDay.get(day) ?? 0) + 1);
  }
  const days = new Set([...byDay.keys(), ...resolvedByDay.keys()]);
  const daily = [...days].sort().map((day) => ({
    day,
    refundDollars: (byDay.get(day) ?? 0) / 100,
    capDollars: settings.dailyCapCents / 100,
    feesAvoidedDollars: (resolvedByDay.get(day) ?? 0) * settings.disputeFeeCents / 100,
  }));
  if (!daily.some((d) => d.day === today)) daily.push({ day: today, refundDollars: 0, capDollars: settings.dailyCapCents / 100, feesAvoidedDollars: 0 });

  return {
    weekly: [...weeks.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, v]) => ({ week, resolved: v.resolved, savedDollars: v.savedCents / 100 })),
    refunds: (Object.keys(groups) as (keyof typeof groups)[]).map((kind) => ({
      kind,
      count: groups[kind].count,
      dollars: groups[kind].cents / 100,
    })),
    totals: {
      resolved: fixed.length,
      becameDispute: cases.filter((c) => c.status === 'became_dispute').length,
      savedCents: fixed.reduce((s, c) => s + Math.max(0, c.savedCents ?? 0), 0),
    },
    dailyCapCents: settings.dailyCapCents,
    dailySpendCents,
    disputeFeesAvoidedCents: fixed.length * settings.disputeFeeCents,
    daily,
  };
}

export type TimelineItem = {
  id: string;
  caseId: string;
  title: string;
  kind: 'approval' | 'shipment' | 'dispute';
  status: CaseStatus;
  dueAt: string;
  overdue: boolean;
  order: string;
};

export async function getTimeline(): Promise<TimelineItem[]> {
  const [cases, shipments] = await Promise.all([
    listCases(),
    db().select({ paypalOrderId: schema.orders.paypalOrderId, status: schema.shipments.status }).from(schema.shipments).innerJoin(schema.orders, eq(schema.shipments.orderId, schema.orders.id)),
  ]);
  const shipmentByOrder = new Map(shipments.map((s) => [s.paypalOrderId, s.status]));
  const now = Date.now();
  const add = (c: CaseListRow, kind: TimelineItem['kind'], title: string, hours: number) => {
    const dueAt = new Date(new Date(c.updatedAt).getTime() + hours * 60 * 60 * 1000).toISOString();
    return { id: `${c.id}-${kind}`, caseId: c.id, title, kind, status: c.status, dueAt, overdue: new Date(dueAt).getTime() < now, order: c.items };
  };
  return cases.flatMap((c) => {
    const items: TimelineItem[] = [];
    if (c.status === 'waiting_on_approval') items.push(add(c, 'approval', 'Seller approval SLA', 48));
    if (c.status === 'waiting_on_buyer' && shipmentByOrder.get(c.paypalOrderId) === 'in_transit') items.push(add(c, 'shipment', 'Parcel re-check', 24));
    if (c.status === 'became_dispute') items.push(add(c, 'dispute', 'PayPal response deadline', 168));
    return items;
  }).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}
