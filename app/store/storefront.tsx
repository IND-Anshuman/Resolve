'use client';

import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { withBase } from '@/lib/base-path';
import { saveLastOrder } from '@/lib/last-order';
import { formatUsd } from '@/lib/money';
import { CATALOG, STORE_NAME } from '@/lib/store/catalog';

// A stable hue per product. Stepping by the golden angle spreads neighbours evenly round the
// colour wheel, so no two pieces next to each other share a glaze.
const hueFor = (sku: string) => Math.round((CATALOG.findIndex((p) => p.sku === sku) * 137.5 + 20) % 360);
const hue = (h: number) => ({ '--h': h }) as React.CSSProperties;

type Placed = { orderId: string; email: string; totalCents: number };

export function Storefront({ clientId }: { clientId: string }) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [placed, setPlaced] = useState<Placed | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lines = useMemo(
    () => CATALOG.filter((p) => cart[p.sku]).map((p) => ({ product: p, quantity: cart[p.sku] })),
    [cart],
  );
  const total = lines.reduce((sum, l) => sum + l.product.priceCents * l.quantity, 0);
  const count = lines.reduce((n, l) => n + l.quantity, 0);

  const change = (sku: string, delta: number) =>
    setCart((c) => {
      const next = Math.max(0, Math.min(10, (c[sku] ?? 0) + delta));
      const rest = Object.fromEntries(Object.entries(c).filter(([key]) => key !== sku));
      return next === 0 ? rest : { ...rest, [sku]: next };
    });

  if (placed) return <Confirmation placed={placed} />;

  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-4 py-10 lg:grid-cols-[1fr_22rem]">
      <section>
        <span className="eyebrow">Demo shop · PayPal sandbox</span>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">{STORE_NAME}</h1>
        <p className="mt-1 text-muted">Handmade ceramics. A demo shop for creating PayPal sandbox orders.</p>
        <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {CATALOG.map((p, i) => (
            <li key={p.sku} className="rise" style={{ '--i': i } as React.CSSProperties}>
              <div className={`card card-hover group flex h-full flex-col overflow-hidden ${p.inStock ? '' : 'opacity-60'}`}>
                <div className="relative flex h-36 items-center justify-center bg-gradient-to-b from-[#f1effa] to-white">
                  <span className="glaze h-20 w-20 rounded-[42%_58%_50%_50%/55%_50%_50%_45%]" style={hue(hueFor(p.sku))} />
                  {cart[p.sku] ? (
                    <span key={cart[p.sku]} className="bump absolute right-3 top-3 rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-white">
                      ×{cart[p.sku]}
                    </span>
                  ) : null}
                  {!p.inStock && <span className="pill absolute left-3 top-3 bg-white text-muted shadow-sm">Sold out</span>}
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="mt-0.5 text-sm text-muted">{formatUsd(p.priceCents)}</p>
                  <button className={`btn mt-auto w-full ${cart[p.sku] ? 'btn-primary' : 'btn-quiet'}`} style={{ marginTop: '0.75rem' }} disabled={!p.inStock} onClick={() => change(p.sku, 1)}>
                    {p.inStock ? (cart[p.sku] ? 'Add another' : 'Add to cart') : 'Out of stock'}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <aside className="card h-fit p-5 lg:sticky lg:top-20">
        <h2 className="flex items-center justify-between text-sm font-semibold">
          Cart
          {count > 0 && (
            <span key={count} className="bump rounded-full bg-clay-soft px-2 py-0.5 text-xs text-clay">
              {count} {count === 1 ? 'item' : 'items'}
            </span>
          )}
        </h2>
        {lines.length === 0 ? (
          <div className="mt-4 flex flex-col items-center rounded-xl border border-dashed border-line py-8 text-center text-sm text-muted">
            <span className="glaze mb-3 h-10 w-10 rounded-full opacity-70" style={hue(250)} />
            Nothing here yet.
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {lines.map(({ product, quantity }) => (
              <li key={product.sku} className="pop flex items-center justify-between gap-2 py-2.5 text-sm">
                <span className="flex items-center gap-2.5">
                  <span className="glaze h-6 w-6 shrink-0 rounded-full" style={hue(hueFor(product.sku))} />
                  {product.name}
                </span>
                <span className="flex items-center gap-1.5">
                  <button aria-label={`Remove one ${product.name}`} className="btn btn-quiet h-7 w-7 !p-0" onClick={() => change(product.sku, -1)}>
                    −
                  </button>
                  <span key={quantity} className="bump w-5 text-center tabular-nums">
                    {quantity}
                  </span>
                  <button aria-label={`Add one ${product.name}`} className="btn btn-quiet h-7 w-7 !p-0" onClick={() => change(product.sku, 1)}>
                    +
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex justify-between border-t border-line pt-4 font-semibold">
          <span>Total</span>
          <span key={total} className="fade tabular-nums">
            {formatUsd(total)}
          </span>
        </div>

        <div className="mt-4">
          {!clientId ? (
            <p className="rounded-xl bg-warn-soft p-3 text-sm text-warn">Set PAYPAL_CLIENT_ID to enable checkout.</p>
          ) : (
            <PayPalScriptProvider options={{ clientId, currency: 'USD', intent: 'capture' }}>
              <PayPalButtons
                style={{ layout: 'vertical', shape: 'pill' }}
                disabled={lines.length === 0}
                forceReRender={[cart]}
                createOrder={async () => {
                  setError(null);
                  const res = await fetch(withBase('/api/store/orders'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items: lines.map((l) => ({ sku: l.product.sku, quantity: l.quantity })) }),
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error ?? 'Could not start checkout');
                  return data.id as string;
                }}
                onApprove={async (data) => {
                  const res = await fetch(withBase('/api/store/capture'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ orderId: data.orderID }),
                  });
                  const body = await res.json();
                  if (!res.ok) {
                    setError(body.error ?? 'The payment did not complete.');
                    return;
                  }
                  saveLastOrder({ orderId: body.orderId, email: body.email });
                  setPlaced(body);
                }}
                onError={() => setError('Checkout hit a problem. Please try again.')}
              />
            </PayPalScriptProvider>
          )}
          {error && <p className="pop mt-3 rounded-xl bg-bad-soft p-3 text-sm text-bad">{error}</p>}
        </div>
      </aside>
    </main>
  );
}

function Confirmation({ placed }: { placed: Placed }) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-14">
      <div className="card card-glow pop p-7">
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-good-soft text-good">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12.5 10 17 19 7" />
          </svg>
        </span>
        <h1 className="text-xl font-semibold">Thanks for your order</h1>
        <p className="mt-1 text-sm text-muted">Payment received.</p>
        <dl className="mt-5 space-y-3 text-sm">
          <div>
            <dt className="text-muted">Order number</dt>
            <dd className="font-mono">{placed.orderId}</dd>
          </div>
          <div>
            <dt className="text-muted">Paid by</dt>
            <dd>{placed.email}</dd>
          </div>
          <div>
            <dt className="text-muted">Total</dt>
            <dd>{formatUsd(placed.totalCents)}</dd>
          </div>
        </dl>
        <p className="mt-5 text-sm text-muted">Something wrong with it later? The help chat can sort it out.</p>
        <div className="mt-4 flex gap-3">
          <Link href="/help" className="btn btn-primary">
            Get help with this order
          </Link>
          <Link href="/store" className="btn btn-quiet">
            Keep shopping
          </Link>
        </div>
      </div>
    </main>
  );
}
