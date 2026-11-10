// All money inside Resolve is integer cents. PayPal sends and expects decimal strings,
// so conversion happens only at the PayPal boundary.

export type Cents = number;

export function toCents(value: string | number): Cents {
  return Math.round(Number(value) * 100);
}

export function toPayPalValue(cents: Cents): string {
  return (cents / 100).toFixed(2);
}

export function formatUsd(cents: Cents): string {
  return `$${(cents / 100).toFixed(2)}`;
}
