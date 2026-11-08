'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/store', label: 'Store' },
  { href: '/help', label: 'Help' },
  { href: '/console', label: 'Console' },
];

export function SiteHeader() {
  const path = usePathname();
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 text-sm">
        <Link href="/" className="font-semibold">
          Resolve
        </Link>
        <nav className="flex gap-5">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={path.startsWith(l.href) ? 'text-ink' : 'text-muted hover:text-ink'}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
