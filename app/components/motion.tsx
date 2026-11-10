'use client';

import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Follows the pointer and writes --rx / --ry (rotation) and --mx / --my (spotlight position)
// as CSS variables. All the visuals live in CSS, so React re-renders nothing on pointer move.
export function Tilt({ children, className = '', max = 10, style }: { children: ReactNode; className?: string; max?: number; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  const move = useCallback(
    (e: React.PointerEvent) => {
      const el = ref.current;
      if (!el || reduced()) return;
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        el.style.setProperty('--rx', `${(0.5 - y) * max}deg`);
        el.style.setProperty('--ry', `${(x - 0.5) * max}deg`);
        el.style.setProperty('--mx', `${x * 100}%`);
        el.style.setProperty('--my', `${y * 100}%`);
      });
    },
    [max],
  );

  const leave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(frame.current);
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  }, []);

  return (
    <div ref={ref} className={`tilt ${className}`} style={style} onPointerMove={move} onPointerLeave={leave}>
      {children}
    </div>
  );
}

// A pill that slides under the active item of a nav or tab list. Items mark themselves with
// data-active="true"; the hook measures that element and moves the indicator to it.
export function useSlidingIndicator<T extends HTMLElement>(key: unknown) {
  const container = useRef<T>(null);
  const [box, setBox] = useState<{ left: number; width: number; ready: boolean }>({ left: 0, width: 0, ready: false });

  useLayoutEffect(() => {
    const measure = () => {
      const active = container.current?.querySelector<HTMLElement>('[data-active="true"]');
      if (!active) return setBox((b) => ({ ...b, width: 0 }));
      setBox({ left: active.offsetLeft, width: active.offsetWidth, ready: true });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (container.current) ro.observe(container.current);
    return () => ro.disconnect();
  }, [key]);

  return { container, style: { transform: `translateX(${box.left}px)`, width: box.width, opacity: box.width ? 1 : 0 }, ready: box.ready };
}
