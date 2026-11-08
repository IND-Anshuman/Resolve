import { errorResponse, json } from '@/lib/api';
import { getResults, recentWebhookEvents } from '@/lib/cases/queries';
import { isConsoleAuthorized, unauthorizedConsoleResponse } from '@/lib/console-auth';

export const dynamic = 'force-dynamic';

// One poll for the console's live strip and the results charts.
export async function GET(request: Request) {
  if (!isConsoleAuthorized(request)) return unauthorizedConsoleResponse();
  try {
    const [events, results] = await Promise.all([recentWebhookEvents(), getResults()]);
    return json({ events, results });
  } catch (err) {
    return errorResponse(err);
  }
}
