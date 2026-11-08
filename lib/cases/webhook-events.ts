// Acts on verified PayPal events. Only disputes change anything; a refund webhook is just
// recorded, since the executor already logged the refund when it made the call.

import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import * as repo from './repo';
import { emitZapierEvent } from '../notify/zapier';

type DisputeResource = {
  dispute_id?: string;
  reason?: string;
  status?: string;
  disputed_transactions?: { seller_transaction_id?: string }[];
};

export type PayPalEvent = { id: string; event_type: string; resource?: unknown };

const DISPUTE_EVENTS = new Set(['CUSTOMER.DISPUTE.CREATED', 'CUSTOMER.DISPUTE.UPDATED', 'CUSTOMER.DISPUTE.RESOLVED']);

export async function processEvent(event: PayPalEvent): Promise<void> {
  if (DISPUTE_EVENTS.has(event.event_type)) await recordDispute(event);
  await db().update(schema.webhookEvents).set({ processedAt: new Date() }).where(eq(schema.webhookEvents.eventId, event.id));
}

async function recordDispute(event: PayPalEvent) {
  const d = (event.resource ?? {}) as DisputeResource;
  if (!d.dispute_id) return;

  // The dispute names the capture it is about; that finds our order.
  const captureId = d.disputed_transactions?.[0]?.seller_transaction_id;
  const [order] = captureId
    ? await db().select().from(schema.orders).where(eq(schema.orders.captureId, captureId))
    : [];
  const openCase = order ? await repo.openCase(order.id) : undefined;
  const status = d.status ?? event.event_type.split('.').pop()!;

  await db()
    .insert(schema.disputes)
    .values({
      disputeId: d.dispute_id,
      orderId: order?.id,
      caseId: openCase?.id,
      reason: d.reason,
      status,
    })
    .onConflictDoUpdate({ target: schema.disputes.disputeId, set: { status, updatedAt: new Date() } });

  // The buyer went to PayPal anyway. The case keeps its transcript, assessment and decision
  // math, which is the evidence file.
  if (event.event_type === 'CUSTOMER.DISPUTE.CREATED' && openCase) {
    await repo.updateCase(openCase.id, { status: 'became_dispute' });
  }
  if (event.event_type === 'CUSTOMER.DISPUTE.CREATED') {
    void emitZapierEvent({
      type: 'dispute.opened',
      disputeId: d.dispute_id,
      caseId: openCase?.id,
      orderId: order?.paypalOrderId,
      reason: d.reason,
    });
  }
}
