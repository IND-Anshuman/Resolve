// Webhook signature verification. The event goes back to PayPal byte-for-byte as received:
// re-serializing a parsed body is the usual reason verification fails.

import { paypalFetch } from './client';

const HEADERS = {
  auth_algo: 'paypal-auth-algo',
  cert_url: 'paypal-cert-url',
  transmission_id: 'paypal-transmission-id',
  transmission_sig: 'paypal-transmission-sig',
  transmission_time: 'paypal-transmission-time',
} as const;

export async function verifyWebhook(headers: Headers, rawBody: string): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) throw new Error('PAYPAL_WEBHOOK_ID must be set (see .env.example)');

  const fields: Record<string, string> = { webhook_id: webhookId };
  for (const [field, header] of Object.entries(HEADERS)) {
    const value = headers.get(header);
    if (!value) return false;
    fields[field] = value;
  }
  // Splice the raw body in as the webhook_event value instead of JSON.stringify-ing it.
  const body = `${JSON.stringify(fields).slice(0, -1)},"webhook_event":${rawBody}}`;
  const res = await paypalFetch<{ verification_status: string }>('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    rawBody: body,
  });
  return res.verification_status === 'SUCCESS';
}
