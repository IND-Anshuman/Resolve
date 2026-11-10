// Single source of truth is next.config.ts, which inlines NEXT_PUBLIC_BASE_PATH at build time.
// Next prefixes <Link> and router URLs by itself; raw fetch() and <img src> need this helper.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const withBase = (path: string) => `${BASE_PATH}${path}`;
