import { runMaintenance } from '@/lib/cases/maintenance';
import { errorResponse, json } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization');
  if (!secret || authorization !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 });
  try {
    return json({ ok: true, ...(await runMaintenance()) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  return GET(request);
}
