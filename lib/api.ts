import { z } from 'zod';
import { ChatError } from './cases/service';

export const json = (body: unknown, status = 200) => Response.json(body, { status });

// Validation errors and ChatErrors are the caller's to see; anything else is logged and
// reported generically so internals (and PayPal responses) never reach the browser.
export function errorResponse(err: unknown): Response {
  if (err instanceof ChatError) {
    const status = { not_found: 404, bad_request: 400, unavailable: 503 }[err.code];
    return json({ error: err.message }, status);
  }
  if (err instanceof z.ZodError) return json({ error: 'That request was not valid.' }, 400);
  // A missing setting is the owner's to fix, and says nothing secret, so it is shown as is.
  if (err instanceof Error && /^[A-Z_]+ must be set/.test(err.message)) return json({ error: err.message }, 503);
  console.error(err);
  return json({ error: 'Something went wrong. Please try again.' }, 500);
}

export async function parseBody<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  try {
    return schema.parse(await request.json());
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new z.ZodError([{ code: 'custom', path: [], message: 'Request body must be valid JSON' }]);
    }
    throw error;
  }
}

// A small in-memory limiter. It resets on restart and is per server instance, which is enough
// to stop a loop from running up the model bill on a demo deployment.
const hits = new Map<string, number[]>();

export function rateLimited(request: Request, key: string, max: number, windowMs: number): boolean {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'local';
  const id = `${key}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(id) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(id, recent);
  if (hits.size > 10_000) {
    for (const [storedId, timestamps] of hits) {
      if (timestamps.every((timestamp) => now - timestamp >= windowMs)) hits.delete(storedId);
    }
  }
  return recent.length > max;
}
