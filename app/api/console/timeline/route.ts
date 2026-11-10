import { errorResponse, json } from '@/lib/api';
import { getTimeline } from '@/lib/cases/queries';
import { isConsoleAuthorized, unauthorizedConsoleResponse } from '@/lib/console-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isConsoleAuthorized(request)) return unauthorizedConsoleResponse();
  try {
    return json({ items: await getTimeline() });
  } catch (error) {
    return errorResponse(error);
  }
}
