import { z } from 'zod';
import { errorResponse, json, parseBody } from '@/lib/api';
import { makeTrackingNumber } from '@/lib/carrier/simulated';
import { db, schema } from '@/lib/db';
import { toCents } from '@/lib/money';
import { addTracking, captureOrder } from '@/lib/paypal/orders';

const body = z.object({ orderId: z.string().min(1) });

export async function POST(request: Request) {
  try {
    const { orderId } = await parseBody(request, body);
    const order = await captureOrder(orderId);
    const unit = order.purchaseUnits?.[0];
    const capture = unit?.payments?.captures?.[0];
    const email = order.payer?.emailAddress;
    if (!capture?.id || !capture.amount || !email) {
      return json({ error: 'The payment did not complete.' }, 502);
    }

    // The saved order is built from what PayPal says was bought and paid.
    const items = (unit?.items ?? []).map((i) => ({
      sku: i.sku ?? 'unknown',
      name: i.name,
      quantity: Number(i.quantity),
      unitCents: toCents(i.unitAmount.value),
    }));
    const [saved] = await db()
      .insert(schema.orders)
      .values({
        paypalOrderId: orderId,
        captureId: capture.id,
        payerEmail: email,
        amountCents: toCents(capture.amount.value),
        currency: capture.amount.currencyCode,
        items,
      })
      .onConflictDoUpdate({ target: schema.orders.paypalOrderId, set: { captureId: capture.id } })
      .returning();

    // The demo store "ships" at once, and the simulated carrier says it was delivered.
    const trackingNumber = makeTrackingNumber('delivered');
    const [shipment] = await db()
      .insert(schema.shipments)
      .values({ orderId: saved.id, trackingNumber, carrier: 'USPS (simulated)', status: 'delivered' })
      .onConflictDoNothing({ target: schema.shipments.orderId })
      .returning({ id: schema.shipments.id });
    // Tracking on the PayPal order is a real call, but a failure here must not undo a paid order.
    if (shipment) await addTracking(orderId, capture.id, trackingNumber).catch((err) => console.error('Add tracking failed', err));

    return json({ orderId, email, totalCents: saved.amountCents });
  } catch (err) {
    return errorResponse(err);
  }
}
