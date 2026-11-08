import { getAttachment } from '@/lib/cases/queries';

// Photos live in the messages table as data URLs. The message id is an unguessable UUID, and
// the response is always served as an image so stored content can never run as a page.
// It is not behind the console token because the buyer's own chat loads these photos too.
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 });
  const file = await getAttachment(id);
  if (!file) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      'Content-Type': file.mime,
      'Content-Security-Policy': "default-src 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
