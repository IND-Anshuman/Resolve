import { BASE_PATH } from '@/lib/base-path';

const COOKIE = 'resolve_console_session';

export function consoleAuthConfigured() {
  return Boolean(process.env.CONSOLE_ACCESS_TOKEN);
}

export function isConsoleAuthorized(request: Request) {
  const expected = process.env.CONSOLE_ACCESS_TOKEN;
  if (!expected) return true;
  if (request.headers.get('authorization') === `Bearer ${expected}`) return true;
  const cookie = request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`));
  if (!cookie) return false;
  try {
    return decodeURIComponent(cookie.slice(COOKIE.length + 1)) === expected;
  } catch {
    return false;
  }
}

export function unauthorizedConsoleResponse() {
  return Response.json({ error: 'Console login required' }, { status: 401 });
}

export function sessionCookie(token: string, maxAge = 60 * 60 * 12) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE}=${encodeURIComponent(token)}; Path=${BASE_PATH || '/'}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}
