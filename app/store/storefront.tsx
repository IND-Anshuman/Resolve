'use client';

import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { saveLastOrder } from '@/lib/last-order';
import { formatUsd } from '@/lib/money';
import { CATALOG, STORE_NAME } from '@/lib/store/catalog';

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
        <h1 className="text-xl font-semibold">{STORE_NAME}</h1>
        <p className="mt-1 text-sm text-muted">Handmade ceramics. A demo shop for creating PayPal sandbox orders.</p>
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {CATALOG.map((p) => (
            <li key={p.sku} className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="text-sm font-medium">{p.name}</p>
                <p className="text-sm text-muted">{formatUsd(p.priceCents)}</p>
              </div>
              <button className="btn btn-quiet" disabled={!p.inStock} onClick={() => change(p.sku, 1)}>
                {p.inStock ? (cart[p.sku] ? `Add another (${cart[p.sku]})` : 'Add') : 'Out of stock'}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <aside className="card h-fit p-5 lg:sticky lg:top-6">
        <h2 className="text-sm font-semibold">Cart</h2>
        {lines.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing here yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {lines.map(({ product, quantity }) => (
              <li key={product.sku} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>{product.name}</span>
                <span className="flex items-center gap-2">
                  <button aria-label={`Remove one ${product.name}`} className="btn btn-quiet px-2 py-0.5" onClick={() => change(product.sku, -1)}>
                    −
                  </button>
                  <span className="w-4 text-center">{quantity}</span>
                  <button aria-label={`Add one ${product.name}`} className="btn btn-quiet px-2 py-0.5" onClick={() => change(product.sku, 1)}>
                    +
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex justify-between border-t border-line pt-4 text-sm font-semibold">
          <span>Total</span>
          <span>{formatUsd(total)}</span>
        </div>

        <div className="mt-4">
          {!clientId ? (
            <p className="rounded-md bg-warn-soft p-3 text-sm text-warn">Set PAYPAL_CLIENT_ID to enable checkout.</p>
          ) : (
            <PayPalScriptProvider options={{ clientId, currency: 'USD', intent: 'capture' }}>
              <PayPalButtons
                style={{ layout: 'vertical', shape: 'rect' }}
                disabled={lines.length === 0}
                forceReRender={[cart]}
                createOrder={async () => {
                  setError(null);
                  const res = await fetch('/api/store/orders', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items: lines.map((l) => ({ sku: l.product.sku, quantity: l.quantity })) }),
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error ?? 'Could not start checkout');
                  return data.id as string;
                }}
                onApprove={async (data) => {
                  const res = await fetch('/api/store/capture', {
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
          {error && <p className="mt-3 rounded-md bg-bad-soft p-3 text-sm text-bad">{error}</p>}
        </div>
      </aside>
    </main>
  );
}

function Confirmation({ placed }: { placed: Placed }) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-14">
      <div className="card p-6">
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
