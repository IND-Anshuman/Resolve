'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Wordmark } from './logo';
import { useSlidingIndicator } from './motion';

const LINKS = [
  { href: '/store', label: 'Store' },
  { href: '/help', label: 'Help' },
  { href: '/console', label: 'Console' },
];

export function SiteHeader() {
  const path = usePathname();
  const { container, style } = useSlidingIndicator<HTMLElement>(path);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`glass sticky top-0 z-40 border-b transition-[border-color,box-shadow] duration-300 ${
        scrolled ? 'border-line shadow-[0_8px_24px_-16px_rgb(20_19_43/0.25)]' : 'border-transparent'
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2.5 text-sm">
        <Link href="/" aria-label="Resolve home">
          <Wordmark />
        </Link>
        <nav ref={container} className="relative flex rounded-full border border-line bg-white/60 p-1 shadow-[var(--shadow-sm)]">
          <span className="slider bg-ink shadow-[0_4px_12px_-4px_rgb(20_19_43/0.5)]" style={{ ...style, top: 4, bottom: 4 }} aria-hidden />
          {LINKS.map((l) => {
            const active = path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                data-active={active}
                aria-current={active ? 'page' : undefined}
                className={`relative z-10 rounded-full px-3.5 py-1.5 transition-colors duration-300 ${active ? 'text-white' : 'text-muted hover:text-ink'}`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
