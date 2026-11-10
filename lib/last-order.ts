// The store hands a finished order to the help chat through sessionStorage, so the buyer's
// email never has to travel in a URL. Every access is wrapped because storage can be blocked.

import { useMemo, useSyncExternalStore } from 'react';

const KEY = 'resolve:last-order';

export type LastOrder = { orderId: string; email: string };

export function saveLastOrder(order: LastOrder): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(order));
  } catch {
    // The buyer can still type the details in by hand.
  }
}

const readRaw = () => {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
};

// The last order as a hook. useSyncExternalStore gives the server render and the first client
// render the same empty value, then switches to what storage holds, with no hydration mismatch.
export function useLastOrder(): LastOrder | null {
  const raw = useSyncExternalStore(() => () => {}, readRaw, () => null);
  return useMemo(() => (raw ? (JSON.parse(raw) as LastOrder) : null), [raw]);
}
