'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatState } from '@/lib/cases/service';
import { saveLastOrder, useLastOrder, type LastOrder } from '@/lib/last-order';
import { formatUsd } from '@/lib/money';

type Message = ChatState['messages'][number] & { preview?: string };

const STATUS_NOTES: Partial<Record<ChatState['status'], string>> = {
  waiting_on_approval: 'With the shop owner for a quick review. This chat updates on its own.',
  became_dispute: 'A PayPal dispute is open for this order.',
};

// Photos are shrunk in the browser first: phone photos are several megabytes, and the model
// does not need more than about 1200 pixels to judge a cracked mug.
async function shrinkImage(file: File, maxSide = 1280): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82);
}

async function post(body: unknown) {
  const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong.');
  return data;
}

export function HelpChat({ demo }: { demo: LastOrder | null }) {
  const [creds, setCreds] = useState<LastOrder | null>(null);
  const last = useLastOrder();
  const [edits, setEdits] = useState<Partial<LastOrder>>({});
  const form: LastOrder = { orderId: edits.orderId ?? last?.orderId ?? '', email: edits.email ?? last?.email ?? '' };
  const [chat, setChat] = useState<ChatState | null>(null);
  const [local, setLocal] = useState<Message[]>([]);
  const [trace, setTrace] = useState<ChatState['trace']>([]);
  const [text, setText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState<'send' | 'offer' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const apply = useCallback((state: ChatState | null) => {
    setChat(state);
    setLocal([]);
  }, []);

  async function start(c: LastOrder) {
    setError(null);
    try {
      const { state } = await post({ action: 'sync', ...c });
      saveLastOrder(c);
      setCreds(c);
      apply(state);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  }

  // Pick up the seller's approval, a refund webhook or a new message without a reload.
  useEffect(() => {
    if (!creds || busy) return;
    const timer = setInterval(async () => {
      try {
        const { state } = await post({ action: 'sync', ...creds });
        if (state) setChat(state);
      } catch {
        // A missed poll is harmless; the next one will catch up.
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [creds, busy]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat?.messages.length, local.length, busy]);

  async function send() {
    if (!creds || busy || (!text.trim() && !image)) return;
    const sent = { text: text.trim(), image };
    setText('');
    setImage(null);
    setError(null);
    setTrace([]);
    setBusy('send');
    setLocal((l) => [
      ...l,
      { id: `local-${Date.now()}`, role: 'buyer', body: sent.text || '(photo attached)', hasImage: false, createdAt: new Date().toISOString(), preview: sent.image ?? undefined },
    ]);
    try {
      const state: ChatState = await post({ action: 'message', ...creds, text: sent.text, image: sent.image });
      setTrace(state.trace);
      apply(state);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setLocal([]);
      setText(sent.text);
      setImage(sent.image);
    } finally {
      setBusy(null);
    }
  }

  async function answerOffer(choice: 'accept' | 'prefer_replacement') {
    if (!creds || busy) return;
    setError(null);
    setTrace([]);
    setBusy('offer');
    try {
      apply(await post({ action: choice, ...creds }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    try {
      setImage(await shrinkImage(file));
    } catch {
      setError('That file could not be read as a photo.');
    }
  }

  if (!creds) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-14">
        <h1 className="text-xl font-semibold">Get help with an order</h1>
        <p className="mt-2 text-sm text-muted">Enter the order number and the email you paid with, then tell us what went wrong.</p>
        <form
          className="card mt-6 space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void start({ orderId: form.orderId.trim(), email: form.email.trim() });
          }}
        >
          <label className="block text-sm font-medium">
            Order number
            <input className="field mt-1 font-mono" value={form.orderId} onChange={(e) => setEdits({ ...edits, orderId: e.target.value })} required />
          </label>
          <label className="block text-sm font-medium">
            Email
            <input type="email" className="field mt-1" value={form.email} onChange={(e) => setEdits({ ...edits, email: e.target.value })} required />
          </label>
          {error && <p className="rounded-md bg-bad-soft p-3 text-sm text-bad">{error}</p>}
          <button className="btn btn-primary w-full" type="submit">
            Start chat
          </button>
          {demo && (
            <button type="button" className="btn btn-quiet w-full" onClick={() => void start(demo)}>
              Use the demo order
            </button>
          )}
        </form>
      </main>
    );
  }

  const messages: Message[] = [...(chat?.messages ?? []), ...local];
  const closed = chat?.status === 'resolved';
  const note = chat && STATUS_NOTES[chat.status];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6">
      <div className="mb-3 flex items-center justify-between text-sm">
        <h1 className="font-medium">Clay &amp; Kiln help</h1>
        <button className="text-muted underline" onClick={() => { setCreds(null); apply(null); }}>
          Use a different order
        </button>
      </div>

      <div className="card flex min-h-[28rem] flex-1 flex-col gap-3 overflow-y-auto p-4" aria-live="polite">
        <Bubble role="agent">Hi, I can help with your order. What happened?</Bubble>
        {messages.map((m) => (
          <Bubble key={m.id} role={m.role}>
            {(m.preview || m.hasImage) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.preview ?? `/api/attachment?id=${m.id}`} alt="Photo you attached" className="mb-2 max-h-48 rounded-md" />
            )}
            {m.body.split('\n\n').map((para, i) => (
              <p key={i} className={i ? 'mt-2' : ''}>
                {para}
              </p>
            ))}
          </Bubble>
        ))}

        {busy === 'send' && <p className="text-sm text-muted">Looking at your order and photo…</p>}
        {trace.length > 0 && !busy && (
          <p className="text-xs text-muted">Checked: {trace.map((t) => t.summary).join(' · ')}</p>
        )}

        {chat?.offer && !busy && (
          <div className="rounded-lg border border-ink p-4">
            <p className="font-medium">{chat.offer.title}</p>
            <p className="mt-1 text-sm text-muted">{chat.offer.detail}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn btn-primary" onClick={() => void answerOffer('accept')}>
                Accept
              </button>
              {chat.offer.canPreferReplacement && (
                <button className="btn btn-quiet" onClick={() => void answerOffer('prefer_replacement')}>
                  Prefer a replacement
                </button>
              )}
            </div>
          </div>
        )}
        {busy === 'offer' && <p className="text-sm text-muted">Sending your refund through PayPal…</p>}

        {chat?.refund && (
          <div className="rounded-lg border border-line p-4">
            <p className="font-medium text-good">Refund sent: {formatUsd(chat.refund.amountCents)}</p>
            <p className="mt-1 text-sm">
              PayPal refund id <span className="font-mono">{chat.refund.id}</span>
            </p>
            <p className="mt-1 text-xs text-muted">Issued through the PayPal sandbox.</p>
          </div>
        )}
        <div ref={bottom} />
      </div>

      {note && <p className="mt-3 rounded-md bg-warn-soft p-3 text-sm text-warn">{note}</p>}
      {error && <p className="mt-3 rounded-md bg-bad-soft p-3 text-sm text-bad">{error}</p>}

      {closed ? (
        <button className="btn btn-quiet mt-3 self-start" onClick={() => { setChat(null); setLocal([]); setTrace([]); }}>
          Start a new conversation
        </button>
      ) : (
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          {image && (
            <div className="mb-2 flex items-center gap-2 text-sm text-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt="Photo to send" className="h-12 rounded" />
              <button type="button" className="underline" onClick={() => setImage(null)}>
                Remove
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => void pickPhoto(e.target.files?.[0])} />
            <button type="button" className="btn btn-quiet" aria-label="Attach a photo" onClick={() => fileInput.current?.click()}>
              Photo
            </button>
            <input
              className="field"
              placeholder="Describe the problem"
              value={text}
              maxLength={2000}
              onChange={(e) => setText(e.target.value)}
              disabled={busy !== null}
            />
            <button className="btn btn-primary" type="submit" disabled={busy !== null || (!text.trim() && !image)}>
              Send
            </button>
          </div>
        </form>
      )}
    </main>
  );
}

function Bubble({ role, children }: { role: Message['role']; children: React.ReactNode }) {
  const mine = role === 'buyer';
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-lg px-3.5 py-2 text-sm ${mine ? 'bg-ink text-white' : 'bg-paper'}`}>
        {role === 'seller' && <p className="mb-1 text-xs font-medium text-muted">Shop owner</p>}
        {children}
      </div>
    </div>
  );
}
