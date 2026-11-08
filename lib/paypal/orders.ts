// Taking payment and reading orders live. Nothing here moves money back to a buyer; refunds
// live only in executor.ts.

import { CheckoutPaymentIntent, ShipmentCarrier, type Order, type PaymentSource } from '@paypal/paypal-server-sdk';
import { randomUUID } from 'node:crypto';
import { toCents, toPayPalValue, type Cents } from '../money';
import type { OrderItem } from '../db/schema';
import { paypal } from './client';

// Without a payment source the buyer approves in the PayPal popup; the seed script passes a
// sandbox test card instead.
export async function createOrder(items: OrderItem[], paymentSource?: PaymentSource, currency = 'USD'): Promise<Order> {
  const total = items.reduce((sum, i) => sum + i.unitCents * i.quantity, 0);
  const { result } = await paypal().orders.createOrder({
    // PayPal requires a request id whenever a payment_source is sent.
    paypalRequestId: randomUUID(),
    body: {
      paymentSource,
      intent: CheckoutPaymentIntent.Capture,
      purchaseUnits: [
        {
          amount: {
            currencyCode: currency,
            value: toPayPalValue(total),
            breakdown: { itemTotal: { currencyCode: currency, value: toPayPalValue(total) } },
          },
          items: items.map((i) => ({
            name: i.name,
            sku: i.sku,
            quantity: String(i.quantity),
            unitAmount: { currencyCode: currency, value: toPayPalValue(i.unitCents) },
          })),
        },
      ],
    },
    prefer: 'return=representation',
  });
  return result;
}

export async function captureOrder(orderId: string): Promise<Order> {
  try {
    const { result } = await paypal().orders.captureOrder({ id: orderId, prefer: 'return=representation' });
    return result;
  } catch (error) {
    // PayPal may have completed the capture even if the browser or our database request timed
    // out. Re-read before surfacing an error so a retry can safely finish local persistence.
    try {
      const { result } = await getOrder(orderId);
      if (result.status === 'COMPLETED') return result;
    } catch {
      // Preserve the original capture error; the follow-up read is only a recovery attempt.
    }
    throw error;
  }
}

export async function getOrder(orderId: string): Promise<{ result: Order }> {
  return paypal().orders.getOrder({ id: orderId });
}

export type LiveOrder = {
  orderId: string;
  status: string;
  payerEmail?: string;
  captureId?: string;
  captureStatus?: string;
  currency: string;
  amountCents: Cents;
  refundedCents: Cents;
  refundableCents: Cents;
  refundCount: number;
};

// The source of truth before any money moves: what PayPal says right now.
export async function getLiveOrder(orderId: string): Promise<LiveOrder> {
  const { result: order } = await paypal().orders.getOrder({ id: orderId });
  const payments = order.purchaseUnits?.[0]?.payments;
  const capture = payments?.captures?.[0];
  const refunds = (payments?.refunds ?? []).filter((r) => r.status !== 'CANCELLED' && r.status !== 'FAILED');
  const amountCents = capture?.amount ? toCents(capture.amount.value) : 0;
  const refundedCents = refunds.reduce((sum, r) => sum + (r.amount ? toCents(r.amount.value) : 0), 0);
  return {
    orderId,
    status: order.status ?? 'UNKNOWN',
    payerEmail: order.payer?.emailAddress,
    captureId: capture?.id,
    captureStatus: capture?.status,
    currency: capture?.amount?.currencyCode ?? 'USD',
    amountCents,
    refundedCents,
    refundableCents: Math.max(0, amountCents - refundedCents),
    refundCount: refunds.length,
  };
}

// PayPal stores the tracking number but does not report delivery status; that comes from
// the (simulated) carrier.
export async function addTracking(orderId: string, captureId: string, trackingNumber: string): Promise<Order> {
  const { result } = await paypal().orders.createOrderTracking({
    id: orderId,
    body: { captureId, trackingNumber, carrier: ShipmentCarrier.Usps, notifyPayer: false },
  });
  return result;
}
