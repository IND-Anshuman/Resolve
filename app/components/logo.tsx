import { useId } from 'react';

// The Resolve mark: an isometric cube with a check carved across its two front faces —
// a "case" that has been closed. Each face has its own gradient so it reads as a solid
// lit from the top-left, and a soft shadow underneath lifts it off the page.
export function LogoMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}t`} x1="10" y1="6" x2="54" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#c4b5fd" />
          <stop offset="1" stopColor="#8b7bff" />
        </linearGradient>
        <linearGradient id={`${id}l`} x1="10" y1="19" x2="32" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6d5efc" />
          <stop offset="1" stopColor="#4338ca" />
        </linearGradient>
        <linearGradient id={`${id}r`} x1="32" y1="19" x2="54" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4f46e5" />
          <stop offset="1" stopColor="#1e1b4b" />
        </linearGradient>
        <linearGradient id={`${id}c`} x1="18" y1="30" x2="47" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#a5f3fc" />
        </linearGradient>
        <radialGradient id={`${id}s`} cx="32" cy="60" r="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1e1b4b" stopOpacity=".35" />
          <stop offset="1" stopColor="#1e1b4b" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="32" cy="60" rx="22" ry="3.5" fill={`url(#${id}s)`} />
      <path d="M32 6 54 19 32 32 10 19Z" fill={`url(#${id}t)`} />
      <path d="M10 19 32 32 32 58 10 45Z" fill={`url(#${id}l)`} />
      <path d="M32 32 54 19 54 45 32 58Z" fill={`url(#${id}r)`} />
      {/* Rim light along the front edges. */}
      <path d="M10 19 32 32 54 19" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="1" strokeLinejoin="round" />
      <path d="M32 32V58" stroke="#fff" strokeOpacity=".18" strokeWidth="1" />
      {/* The carved check: a dark groove first, the bright stroke slightly above it. */}
      <path d="M18.5 36.5 28 43 46.5 30.5" fill="none" stroke="#1e1b4b" strokeOpacity=".45" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" transform="translate(0 1.2)" />
      <path d="M18.5 36.5 28 43 46.5 30.5" fill="none" stroke={`url(#${id}c)`} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark({ size = 26 }: { size?: number }) {
  return (
    <span className="logo-lockup inline-flex items-center gap-2">
      <span className="logo-3d">
        <LogoMark size={size} />
      </span>
      <span className="text-[15px] font-semibold tracking-tight">Resolve</span>
    </span>
  );
}
