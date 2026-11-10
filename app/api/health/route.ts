// Unauthenticated liveness check for Render. It touches nothing private, so the console
// token does not need to be shared with the platform.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ ok: true });
}
