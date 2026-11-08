// The executor is the ONLY code allowed to call PayPal's refund endpoint. It re-checks the
// guardrail outcome, re-reads the capture live, attaches the idempotency key, and logs the
// request and the response to `actions`. The model has no path to this module.

import { ApiError, type Refund, type RefundRequest } from '@paypal/paypal-server-sdk';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import type { GuardrailOutcome } from '../engine/guardrails';
import { formatUsd, toCents, toPayPalValue, type Cents } from '../money';
import { paypal } from './client';
import { getLiveOrder, type LiveOrder } from './orders';

export type RefundCommand = {
  // Becomes the PayPal-Request-Id; see refundRequestId.
  requestId: string;
  caseId: string | null;
  paypalOrderId: string;
  amountCents: Cents | 'full';
  guardrail: GuardrailOutcome;
  // Required when the guardrail outcome is needs_approval.
  approvedBy?: string;
  noteToPayer?: string;
};

export type RefundResult =
  | { ok: true; refundId: string; status: string; amountCents: Cents; replayed: boolean }
  | { ok: false; reason: string };

type ActionRow = {
  requestId: string;
  caseId: string | null;
  paypalRequest: unknown;
  paypalResponse?: unknown;
  httpStatus?: number;
  status: 'pending' | 'succeeded' | 'failed';
};

export type ExecutorDeps = {
  getLiveOrder(orderId: string): Promise<LiveOrder>;
  refundCapture(captureId: string, requestId: string, body: RefundRequest): Promise<{ statusCode: number; result: Refund }>;
  findAction(requestId: string): Promise<{ status: string; paypalResponse: unknown } | undefined>;
  saveAction(row: ActionRow): Promise<void>;
};

// Case id plus decision version: a retry of the same decision can never refund twice, while
// a revised decision gets a new key.
export const refundRequestId = (caseId: string, decisionVersion: number) => `${caseId}-v${decisionVersion}`;

export async function executeRefund(cmd: RefundCommand, deps: ExecutorDeps = defaultDeps): Promise<RefundResult> {
  if (cmd.guardrail === 'blocked') return { ok: false, reason: 'Blocked by guardrails' };
  if (cmd.guardrail === 'needs_approval' && !cmd.approvedBy) return { ok: false, reason: 'Needs seller approval' };

  const earlier = await deps.findAction(cmd.requestId);
  if (earlier?.status === 'succeeded') {
    const refund = earlier.paypalResponse as Refund;
    return {
      ok: true,
      refundId: refund.id ?? '',
      status: refund.status ?? 'UNKNOWN',
      amountCents: refund.amount ? toCents(refund.amount.value) : 0,
      replayed: true,
    };
  }

  // Limits were checked when the decision was made, but approval can come much later, and
  // the buyer may have been refunded elsewhere since. PayPal right now is the truth.
  const live = await deps.getLiveOrder(cmd.paypalOrderId);
  if (!live.captureId) return { ok: false, reason: 'Order has no capture to refund' };
  const amount = cmd.amountCents === 'full' ? live.refundableCents : cmd.amountCents;
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: `Invalid refund amount ${amount}` };
  if (amount > live.refundableCents) {
    return {
      ok: false,
      reason: `Refund ${formatUsd(amount)} exceeds ${formatUsd(live.refundableCents)} still refundable`,
    };
  }

  // Always an explicit amount, never the empty "refund everything" body, so the log shows
  // exactly what was asked for.
  const body: RefundRequest = {
    amount: { currencyCode: live.currency, value: toPayPalValue(amount) },
    ...(cmd.noteToPayer ? { noteToPayer: cmd.noteToPayer } : {}),
  };
  const paypalRequest = { captureId: live.captureId, requestId: cmd.requestId, body, approvedBy: cmd.approvedBy };
  await deps.saveAction({ requestId: cmd.requestId, caseId: cmd.caseId, paypalRequest, status: 'pending' });

  try {
    const { statusCode, result } = await deps.refundCapture(live.captureId, cmd.requestId, body);
    const succeeded = result.status === 'COMPLETED' || result.status === 'PENDING';
    await deps.saveAction({
      requestId: cmd.requestId,
      caseId: cmd.caseId,
      paypalRequest,
      paypalResponse: result,
      httpStatus: statusCode,
      status: succeeded ? 'succeeded' : 'failed',
    });
    if (!succeeded) return { ok: false, reason: `PayPal refund status ${result.status}` };
    return { ok: true, refundId: result.id ?? '', status: result.status ?? 'UNKNOWN', amountCents: amount, replayed: false };
  } catch (err) {
    const status = err instanceof ApiError ? err.statusCode : undefined;
    const response = err instanceof ApiError ? (err.result ?? String(err.body)) : String(err);
    await deps.saveAction({
      requestId: cmd.requestId,
      caseId: cmd.caseId,
      paypalRequest,
      paypalResponse: response,
      httpStatus: status,
      status: 'failed',
    });
    return { ok: false, reason: `PayPal refund failed${status ? ` (${status})` : ''}` };
  }
}

const defaultDeps: ExecutorDeps = {
  getLiveOrder,
  async refundCapture(captureId, requestId, body) {
    const { statusCode, result } = await paypal().payments.refundCapturedPayment({
      captureId,
      paypalRequestId: requestId,
      prefer: 'return=representation',
      body,
    });
    return { statusCode, result };
  },
  async findAction(requestId) {
    const [row] = await db()
      .select({ status: schema.actions.status, paypalResponse: schema.actions.paypalResponse })
      .from(schema.actions)
      .where(eq(schema.actions.requestId, requestId));
    return row;
  },
  async saveAction(row) {
    const values = { kind: 'refund' as const, ...row };
    await db()
      .insert(schema.actions)
      .values(values)
      .onConflictDoUpdate({
        target: schema.actions.requestId,
        set: {
          paypalRequest: values.paypalRequest,
          paypalResponse: values.paypalResponse,
          httpStatus: values.httpStatus,
          status: values.status,
        },
      });
  },
};
