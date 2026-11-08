import { errorResponse, json } from '@/lib/api';
import { getCaseDetail, listCases } from '@/lib/cases/queries';
import { isConsoleAuthorized, unauthorizedConsoleResponse } from '@/lib/console-auth';

export const dynamic = 'force-dynamic';

// GET /api/console/cases           -> every case
// GET /api/console/cases?id=<uuid> -> one case's transcript, decision math and PayPal log
export async function GET(request: Request) {
  if (!isConsoleAuthorized(request)) return unauthorizedConsoleResponse();
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Not found' }, 404);
      return json(await getCaseDetail(id));
    }
    return json({ cases: await listCases() });
  } catch (err) {
    return errorResponse(err);
  }
}
