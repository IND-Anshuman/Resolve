// PayPal webhook receiver. Every event is verified, then stored once by its event id; the
// seller console's live activity strip reads from webhook_events.

import { eq } from 'drizzle-orm';
import { errorResponse } from '@/lib/api';
import { processEvent, type PayPalEvent } from '@/lib/cases/webhook-events';
import { db, schema } from '@/lib/db';
import { verifyWebhook } from '@/lib/paypal/webhooks';

type WebhookEvent = { id: string; event_type: string };

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (rawBody.length > 2_000_000) return new Response('Payload too large', { status: 413 });
  let event: WebhookEvent;
  try {
    event = JSON.parse(rawBody) as WebhookEvent;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  if (!event.id || !event.event_type) return new Response('Not a PayPal event', { status: 400 });

  let verified: boolean;
  try {
    verified = await verifyWebhook(request.headers, rawBody);
  } catch (error) {
    return errorResponse(error);
  }
  // Unverified events are kept for debugging but never acted on. A verified delivery wins over
  // an earlier unverified one with the same id, so a spoofed event cannot shadow a real one.
  const insert = db()
    .insert(schema.webhookEvents)
    .values({ eventId: event.id, type: event.event_type, verified, payload: event });
  await (verified
    ? insert.onConflictDoUpdate({ target: schema.webhookEvents.eventId, set: { verified: true, payload: event } })
    : insert.onConflictDoNothing({ target: schema.webhookEvents.eventId }));

  if (!verified) return new Response('Signature verification failed', { status: 401 });

  // PayPal redelivers events, so only act on one the first time it is seen.
  const [row] = await db().select().from(schema.webhookEvents).where(eq(schema.webhookEvents.eventId, event.id));
  if (!row?.processedAt) await processEvent(event as PayPalEvent);
  return new Response(null, { status: 200 });
}
