// Database reads and writes for cases. No decisions are made here.

import { and, asc, desc, eq, gte, lt, ne, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import type { CaseStatus } from '../db/schema';
import type { Cents } from '../money';

const { orders, cases, messages, assessments, decisions, actions } = schema;

export type OrderRow = typeof orders.$inferSelect;
export type CaseRow = typeof cases.$inferSelect;
export type DecisionRow = typeof decisions.$inferSelect;

export async function findOrder(paypalOrderId: string): Promise<OrderRow | undefined> {
  const [row] = await db().select().from(orders).where(eq(orders.paypalOrderId, paypalOrderId));
  return row;
}

export async function latestCase(orderId: string): Promise<CaseRow | undefined> {
  const [row] = await db().select().from(cases).where(eq(cases.orderId, orderId)).orderBy(desc(cases.createdAt)).limit(1);
  return row;
}

export async function openCase(orderId: string): Promise<CaseRow | undefined> {
  const [row] = await db()
    .select()
    .from(cases)
    .where(and(eq(cases.orderId, orderId), ne(cases.status, 'resolved')))
    .limit(1);
  return row;
}

export async function createCase(orderId: string): Promise<CaseRow> {
  const [row] = await db().insert(cases).values({ orderId }).onConflictDoNothing().returning();
  if (row) return row;
  const existing = await openCase(orderId);
  if (!existing) throw new Error('Could not create or find the case for this order');
  return existing;
}

export async function getCase(caseId: string): Promise<CaseRow | undefined> {
  const [row] = await db().select().from(cases).where(eq(cases.id, caseId));
  return row;
}

export async function updateCase(
  caseId: string,
  patch: Partial<Pick<CaseRow, 'status' | 'complaintType' | 'outcome' | 'amountRefundedCents' | 'savedVsDefaultCents'>>,
): Promise<void> {
  await db().update(cases).set({ ...patch, updatedAt: new Date() }).where(eq(cases.id, caseId));
}

export async function addMessage(
  caseId: string,
  role: 'buyer' | 'agent' | 'seller',
  body: string,
  attachmentUrl?: string | null,
) {
  const [row] = await db().insert(messages).values({ caseId, role, body, attachmentUrl: attachmentUrl ?? null }).returning();
  return row;
}

export const caseMessages = (caseId: string) =>
  db().select().from(messages).where(eq(messages.caseId, caseId)).orderBy(asc(messages.createdAt));

export async function nextVersion(caseId: string): Promise<number> {
  const [row] = await db()
    .select({ max: sql<number>`coalesce(max(${assessments.version}), 0)::int` })
    .from(assessments)
    .where(eq(assessments.caseId, caseId));
  return row.max + 1;
}

export async function latestDecision(caseId: string): Promise<DecisionRow | undefined> {
  const [row] = await db().select().from(decisions).where(eq(decisions.caseId, caseId)).orderBy(desc(decisions.version)).limit(1);
  return row;
}

export async function latestAssessment(caseId: string) {
  const [row] = await db().select().from(assessments).where(eq(assessments.caseId, caseId)).orderBy(desc(assessments.version)).limit(1);
  return row;
}

export async function markApproved(decisionId: string, approvedBy: string): Promise<void> {
  await db().update(decisions).set({ approvedBy, approvedAt: new Date() }).where(eq(decisions.id, decisionId));
}

// Atomic claim to prevent two console tabs or Render instances from approving the same case
// with different override amounts.
export async function claimApproval(caseId: string): Promise<boolean> {
  const rows = await db()
    .update(cases)
    .set({ status: 'processing_approval', updatedAt: new Date() })
    .where(and(eq(cases.id, caseId), eq(cases.status, 'waiting_on_approval')))
    .returning({ id: cases.id });
  return rows.length === 1;
}

export async function claimOffer(caseId: string): Promise<boolean> {
  const rows = await db()
    .update(cases)
    .set({ status: 'processing_refund', updatedAt: new Date() })
    .where(and(eq(cases.id, caseId), eq(cases.status, 'waiting_on_buyer')))
    .returning({ id: cases.id });
  return rows.length === 1;
}

export async function expireApproval(caseId: string, cutoff: Date): Promise<boolean> {
  const rows = await db()
    .update(cases)
    .set({ status: 'resolved', outcome: 'approval_expired', amountRefundedCents: 0, updatedAt: new Date() })
    .where(and(eq(cases.id, caseId), eq(cases.status, 'waiting_on_approval'), lt(cases.updatedAt, cutoff)))
    .returning({ id: cases.id });
  return rows.length === 1;
}

export async function recoverApproval(caseId: string, cutoff: Date): Promise<boolean> {
  const rows = await db()
    .update(cases)
    .set({ status: 'waiting_on_approval', updatedAt: new Date() })
    .where(and(eq(cases.id, caseId), eq(cases.status, 'processing_approval'), lt(cases.updatedAt, cutoff)))
    .returning({ id: cases.id });
  return rows.length === 1;
}

export async function recoverRefund(caseId: string, cutoff: Date): Promise<boolean> {
  const rows = await db()
    .update(cases)
    .set({ status: 'waiting_on_buyer', updatedAt: new Date() })
    .where(and(eq(cases.id, caseId), eq(cases.status, 'processing_refund'), lt(cases.updatedAt, cutoff)))
    .returning({ id: cases.id });
  return rows.length === 1;
}

// The PayPal refund id for a resolved case, read back from the logged response.
export async function refundForCase(caseId: string): Promise<{ id: string; amountCents: Cents } | null> {
  const [row] = await db()
    .select({ response: actions.paypalResponse })
    .from(actions)
    .where(and(eq(actions.caseId, caseId), eq(actions.kind, 'refund'), eq(actions.status, 'succeeded')))
    .orderBy(desc(actions.createdAt))
    .limit(1);
  const refund = row?.response as { id?: string; amount?: { value?: string } } | undefined;
  if (!refund?.id) return null;
  return { id: refund.id, amountCents: Math.round(Number(refund.amount?.value ?? 0) * 100) };
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Refunds this buyer received in the last 90 days, counted from our own cases. (Transaction
// Search could also see refunds made outside Resolve, but it lags by hours.)
export async function buyerHistory(email: string) {
  const since = new Date(Date.now() - 90 * DAY_MS);
  const [refunds] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(cases)
    .innerJoin(orders, eq(cases.orderId, orders.id))
    .where(and(eq(orders.payerEmail, email), sql`${cases.amountRefundedCents} > 0`, gte(cases.updatedAt, since)));
  const [placed] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(eq(orders.payerEmail, email), gte(orders.createdAt, since)));
  return { ordersLast90Days: placed.n, refundsLast90Days: refunds.n };
}

// Automatic refunds paid out since midnight UTC. Approved refunds do not count against the
// daily cap, which exists to limit what runs without a person.
export async function autoRefundedToday(): Promise<Cents> {
  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  const [row] = await db()
    .select({
      cents: sql<number>`coalesce(sum(round((${actions.paypalRequest}->'body'->'amount'->>'value')::numeric * 100)), 0)::int`,
    })
    .from(actions)
    .where(
      and(
        eq(actions.kind, 'refund'),
        eq(actions.status, 'succeeded'),
        gte(actions.createdAt, midnight),
        sql`${actions.paypalRequest}->>'approvedBy' is null`,
      ),
    );
  return row.cents;
}

export type { CaseStatus };
