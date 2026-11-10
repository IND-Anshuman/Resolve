import { and, eq, lt } from 'drizzle-orm';
import { db, schema } from '../db';
import { simulatedCarrier } from '../carrier/simulated';
import * as repo from './repo';

export async function runMaintenance() {
  const transit = await db().select().from(schema.shipments).where(eq(schema.shipments.status, 'in_transit'));
  let shipmentUpdates = 0;
  for (const shipment of transit) {
    const latest = await simulatedCarrier.getShipmentStatus(shipment.trackingNumber);
    if (latest.status !== shipment.status) {
      await db().update(schema.shipments).set({ status: latest.status }).where(eq(schema.shipments.id, shipment.id));
      shipmentUpdates += 1;
    }
  }

  const configuredHours = Number(process.env.APPROVAL_EXPIRY_HOURS ?? 48);
  const hours = Number.isFinite(configuredHours) && configuredHours > 0 ? configuredHours : 48;
  const cutoff = new Date(Date.now() - Math.max(1, hours) * 60 * 60 * 1000);
  const stale = await db().select().from(schema.cases).where(and(eq(schema.cases.status, 'waiting_on_approval'), lt(schema.cases.updatedAt, cutoff)));
  let expiredApprovals = 0;
  for (const c of stale) {
    if (await repo.expireApproval(c.id, cutoff)) {
      expiredApprovals += 1;
      await repo.addMessage(c.id, 'seller', 'This approval expired without a response. The case was closed safely without moving money.');
    }
  }
  const processingCutoff = new Date(Date.now() - Math.max(hours, 1) * 60 * 60 * 1000);
  const stuck = await db().select().from(schema.cases).where(and(eq(schema.cases.status, 'processing_approval'), lt(schema.cases.updatedAt, processingCutoff)));
  let recoveredApprovals = 0;
  for (const c of stuck) {
    if (await repo.recoverApproval(c.id, processingCutoff)) {
      recoveredApprovals += 1;
      await repo.addMessage(c.id, 'seller', 'An approval attempt did not finish. The case was returned to the approval queue without assuming a refund succeeded.');
    }
  }
  const refundCutoff = new Date(Date.now() - Math.max(hours, 1) * 60 * 60 * 1000);
  const stuckRefunds = await db().select().from(schema.cases).where(and(eq(schema.cases.status, 'processing_refund'), lt(schema.cases.updatedAt, refundCutoff)));
  let recoveredRefunds = 0;
  for (const c of stuckRefunds) {
    if (await repo.recoverRefund(c.id, refundCutoff)) {
      recoveredRefunds += 1;
      await repo.addMessage(c.id, 'seller', 'A buyer acceptance did not finish. The offer was restored so it can be safely retried.');
    }
  }
  return { shipmentUpdates, expiredApprovals, recoveredApprovals, recoveredRefunds, cutoff: cutoff.toISOString() };
}
