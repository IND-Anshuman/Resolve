// Shared by the seed scripts: pay for a real sandbox order with the test card, then save it
// and a simulated shipment. Loading .env.local happens here so every script that imports this
// gets the same environment.

import { config } from 'dotenv';
config({ path: '.env.local' });

import { db, schema } from '../../lib/db';
import type { OrderItem } from '../../lib/db/schema';
import { makeTrackingNumber, type ShipmentStatus } from '../../lib/carrier/simulated';
import { toCents } from '../../lib/money';
import { addTracking, captureOrder, createOrder } from '../../lib/paypal/orders';
import { productBySku } from '../../lib/store/catalog';

export function testCard() {
  const { PAYPAL_TEST_CARD_NUMBER: number, PAYPAL_TEST_CARD_EXPIRY: expiry } = process.env;
  if (!number || !expiry) {
    throw new Error('PAYPAL_TEST_CARD_NUMBER and PAYPAL_TEST_CARD_EXPIRY must be set (sandbox card generator, expiry YYYY-MM)');
  }
  return { number, expiry };
}

export const line = (sku: string, quantity = 1): OrderItem => {
  const p = productBySku(sku);
  if (!p) throw new Error(`Unknown sku ${sku}`);
  return { sku, name: p.name, quantity, unitCents: p.priceCents };
};

// `email` is what the buyer proves identity with in the help chat. Card payments carry no
// PayPal account email, so the seed value is the one on record.
export async function placeOrder(args: { items: OrderItem[]; email: string; shipment: ShipmentStatus; cardName?: string }) {
  const card = testCard();
  const created = await createOrder(args.items, { card: { ...card, name: args.cardName ?? 'Demo Buyer' } });
  const order = created.status === 'COMPLETED' ? created : await captureOrder(created.id!);
  const capture = order.purchaseUnits?.[0]?.payments?.captures?.[0];
  if (!capture?.id || !capture.amount) throw new Error(`Order ${order.id} has no capture (status ${order.status})`);

  const [saved] = await db()
    .insert(schema.orders)
    .values({
      paypalOrderId: order.id!,
      captureId: capture.id,
      payerEmail: args.email,
      amountCents: toCents(capture.amount.value),
      currency: capture.amount.currencyCode,
      items: args.items,
    })
    .onConflictDoNothing()
    .returning();

  const trackingNumber = makeTrackingNumber(args.shipment);
  if (saved) {
    await db().insert(schema.shipments).values({ orderId: saved.id, trackingNumber, carrier: 'USPS (simulated)', status: args.shipment });
  }
  await addTracking(order.id!, capture.id, trackingNumber).catch((err) => console.warn('  (tracking not added to PayPal:', err.message, ')'));
  return { orderId: order.id!, captureId: capture.id, amount: capture.amount.value, trackingNumber };
}
