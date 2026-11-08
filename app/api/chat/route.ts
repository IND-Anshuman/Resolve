import { z } from 'zod';
import { errorResponse, json, parseBody, rateLimited } from '@/lib/api';
import { handleBuyerMessage, respondToOffer, syncChat } from '@/lib/cases/service';

const body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('message'),
    orderId: z.string().min(1),
    email: z.string().min(1),
    text: z.string().default(''),
    image: z.string().nullish(),
  }),
  z.object({ action: z.literal('sync'), orderId: z.string().min(1), email: z.string().min(1) }),
  z.object({
    action: z.enum(['accept', 'prefer_replacement']),
    orderId: z.string().min(1),
    email: z.string().min(1),
  }),
]);

export async function POST(request: Request) {
  try {
    const req = await parseBody(request, body);
    // Only the actions that call the model or PayPal are limited; polling is cheap.
    if (req.action !== 'sync' && rateLimited(request, 'chat', 30, 10 * 60_000)) {
      return json({ error: 'Too many requests. Please wait a few minutes.' }, 429);
    }
    if (req.action === 'message') {
      return json(await handleBuyerMessage({ orderId: req.orderId, email: req.email, text: req.text, imageDataUrl: req.image }));
    }
    if (req.action === 'sync') return json({ state: await syncChat(req) });
    return json(await respondToOffer({ orderId: req.orderId, email: req.email, choice: req.action }));
  } catch (err) {
    return errorResponse(err);
  }
}
