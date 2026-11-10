import { errorResponse, json, parseBody } from '@/lib/api';
import { getSettings, saveSettings } from '@/lib/settings-store';
import { settingsSchema } from '@/lib/settings-schema';
import { isConsoleAuthorized, unauthorizedConsoleResponse } from '@/lib/console-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isConsoleAuthorized(request)) return unauthorizedConsoleResponse();
  try {
    return json(await getSettings());
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(request: Request) {
  if (!isConsoleAuthorized(request)) return unauthorizedConsoleResponse();
  try {
    const settings = await parseBody(request, settingsSchema);
    await saveSettings(settings);
    return json(settings);
  } catch (err) {
    return errorResponse(err);
  }
}
