import Link from 'next/link';
import { SiteHeader } from './components/site-header';

const PAGES = [
  { href: '/store', title: 'Store', body: 'Place a sandbox order with PayPal Checkout.' },
  { href: '/help', title: 'Help chat', body: 'Complain about an order as the buyer.' },
  { href: '/console', title: 'Seller console', body: 'Review cases, approve refunds, change limits.' },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Resolve</h1>
        <p className="mt-3 text-muted">
          Settles a buyer&apos;s complaint before it becomes a PayPal dispute. It checks the order, works out a fair fix, and
          refunds through PayPal within limits the seller sets. Larger refunds wait for the seller.
        </p>

        <ul className="mt-10 divide-y divide-line border-y border-line">
          {PAGES.map((p) => (
            <li key={p.href}>
              <Link href={p.href} className="flex items-baseline justify-between gap-4 py-4 hover:text-muted">
                <span className="font-medium">{p.title}</span>
                <span className="text-right text-sm text-muted">{p.body}</span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-sm text-muted">
          Sandbox only. Orders, refunds and webhooks are real PayPal sandbox calls, so no real money moves. Delivery status
          comes from a simulated carrier.
        </p>
      </main>
    </>
  );
}
