import { z } from 'zod';
import { errorResponse, json, parseBody, rateLimited } from '@/lib/api';
import { consoleAuthConfigured, sessionCookie } from '@/lib/console-auth';

const body = z.object({ token: z.string().min(1) });

export async function POST(request: Request) {
  if (!consoleAuthConfigured()) return json({ ok: true });
  if (rateLimited(request, 'console-login', 10, 10 * 60_000)) return json({ error: 'Too many login attempts. Try again later.' }, 429);
  try {
    const input = await parseBody(request, body);
    if (input.token !== process.env.CONSOLE_ACCESS_TOKEN) return json({ error: 'Invalid console token' }, 401);
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie(input.token) } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie('', 0) } });
}
