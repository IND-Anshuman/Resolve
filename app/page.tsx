import Link from 'next/link';
import { LogoMark } from './components/logo';
import { Tilt } from './components/motion';

const PAGES = [
  { href: '/store', title: 'Store', body: 'Place a sandbox order with PayPal Checkout.', icon: 'M4 7h16l-1.5 11a2 2 0 0 1-2 1.7H7.5a2 2 0 0 1-2-1.7L4 7Zm4 0V6a4 4 0 0 1 8 0v1' },
  { href: '/help', title: 'Help chat', body: 'Complain about an order as the buyer, photo and all.', icon: 'M4 5h16v11H9l-5 4V5Z' },
  { href: '/console', title: 'Seller console', body: 'Review cases, approve refunds, tune the limits.', icon: 'M4 4h7v7H4V4Zm9 0h7v4h-7V4Zm0 6h7v10h-7V10ZM4 13h7v7H4v-7Z' },
];

const STEPS = [
  { n: '01', title: 'Checks the facts', body: 'Reads the PayPal order, tracking and any photo the buyer sends.' },
  { n: '02', title: 'Prices every fix', body: 'Plain code compares refund, partial, replacement and hold by expected cost.' },
  { n: '03', title: 'Pays within limits', body: 'Refunds through PayPal under your caps. Anything bigger waits for you.' },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20">
      {/* Hero */}
      <section className="grid items-center gap-12 pt-14 pb-16 lg:grid-cols-[1.1fr_1fr] lg:pt-24">
        <div>
          <span className="eyebrow rise">
            <span className="live-dot" /> PayPal sandbox · live demo
          </span>
          <h1 className="rise mt-6 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl" style={{ '--i': 1 } as React.CSSProperties}>
            <span className="text-gradient">Settle the complaint</span>
            <br />
            before it becomes a dispute.
          </h1>
          <p className="rise mt-6 max-w-xl text-lg leading-relaxed text-muted" style={{ '--i': 2 } as React.CSSProperties}>
            Resolve checks the order, works out a fair fix, and refunds through PayPal within limits the seller sets. Larger refunds wait for
            the seller.
          </p>
          <div className="rise mt-8 flex flex-wrap gap-3" style={{ '--i': 3 } as React.CSSProperties}>
            <Link href="/help" className="btn btn-primary btn-lg">
              Try the buyer chat
              <Arrow />
            </Link>
            <Link href="/console" className="btn btn-quiet btn-lg">
              Open the console
            </Link>
          </div>
        </div>

        <HeroScene />
      </section>

      {/* Destinations */}
      <section className="grid gap-4 sm:grid-cols-3">
        {PAGES.map((p, i) => (
          <Tilt key={p.href} max={8} className="rise" style={{ '--i': i + 4 } as React.CSSProperties}>
            <Link href={p.href} className="tilt-inner card card-hover spotlight group block h-full p-6">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#8b7bff] to-[#4338ca] text-white shadow-[0_8px_20px_-6px_rgb(91_79_245/0.6)] transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
                  <path d={p.icon} />
                </svg>
              </span>
              <h2 className="mt-5 flex items-center gap-2 font-semibold">
                {p.title}
                <span className="translate-x-0 opacity-0 transition-all duration-300 group-hover:translate-x-1 group-hover:opacity-100">
                  <Arrow />
                </span>
              </h2>
              <p className="mt-1.5 text-sm text-muted">{p.body}</p>
            </Link>
          </Tilt>
        ))}
      </section>

      {/* How it works */}
      <section className="mt-24">
        <h2 className="text-center text-sm font-medium uppercase tracking-[0.2em] text-muted">How it works</h2>
        <ol className="relative mt-10 grid gap-6 sm:grid-cols-3">
          <span aria-hidden className="absolute left-[16%] right-[16%] top-6 hidden h-px bg-gradient-to-r from-transparent via-[#8b7bff] to-transparent sm:block" />
          {STEPS.map((s) => (
            <li key={s.n} className="relative text-center">
              <span className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-white font-mono text-sm font-semibold text-clay shadow-[var(--shadow-md)]">
                {s.n}
              </span>
              <h3 className="mt-4 font-semibold">{s.title}</h3>
              <p className="mx-auto mt-1 max-w-[16rem] text-sm text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <p className="mx-auto mt-24 max-w-2xl text-center text-xs leading-relaxed text-muted">
        Sandbox only. Orders, refunds and webhooks are real PayPal sandbox calls, so no real money moves. Delivery status comes from a
        simulated carrier.
      </p>
    </main>
  );
}

// A tilted stack of mock cards telling the whole story in one glance: complaint → decision → refund.
function HeroScene() {
  return (
    <Tilt max={14} className="relative mx-auto w-full max-w-md">
      <div className="tilt-inner relative h-[29rem]" style={{ transform: 'rotateX(calc(var(--rx) + 8deg)) rotateY(calc(var(--ry) - 14deg))' }}>
        <div className="absolute left-1/2 top-0" style={{ transform: 'translateX(-50%) translateZ(-40px)' }}>
          <div className="relative">
            <div className="logo-halo" />
            <LogoMark size={176} className="logo-hero relative" />
          </div>
        </div>

        <div className="depth-2 absolute left-0 top-[11rem] w-64"><div className="card pop p-3.5 text-sm" style={{ animationDelay: '300ms' }}>
          <p className="text-xs text-muted">Buyer · Clay &amp; Kiln</p>
          <p className="mt-1">My mug set arrived with two cracked mugs 😞</p>
          <div className="mt-2 h-14 rounded-lg bg-[linear-gradient(135deg,#e9d5c3,#b08968)]" />
        </div></div>

        <div className="depth-3 absolute right-0 top-[14.5rem] w-60"><div className="card pop p-3.5 text-sm" style={{ animationDelay: '550ms' }}>
          <p className="text-xs text-muted">Decision</p>
          <div className="mt-2 space-y-1.5 font-mono text-xs">
            <Row k="Replacement" v="$26.00" />
            <Row k="Partial refund" v="$30.00" best />
            <Row k="Explain & hold" v="$41.40" />
          </div>
        </div></div>

        <div className="depth-2 absolute bottom-0 left-10 w-60"><div className="card card-glow pop p-3.5 text-sm" style={{ animationDelay: '800ms' }}>
          <p className="flex items-center gap-2 font-medium text-good">
            <span className="live-dot" /> Refund sent · $30.00
          </p>
          <p className="mt-1 text-xs text-muted">Through PayPal, within your $50 cap.</p>
        </div></div>
      </div>
    </Tilt>
  );
}

function Row({ k, v, best }: { k: string; v: string; best?: boolean }) {
  return (
    <div className={`flex justify-between rounded-md px-2 py-1 ${best ? 'bg-clay-soft font-semibold text-clay' : 'text-muted'}`}>
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}

function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}
