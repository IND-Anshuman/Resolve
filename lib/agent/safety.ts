// Checks on what the model writes to the buyer. The offer amount always comes from the engine,
// so any other money figure in the reply, a link, or a claim that a refund already happened
// means the model has gone off script and the reply is swapped for a safe template.

import { toCents, type Cents } from '../money';

const DOLLAR = /\$\s?(\d[\d,]*(?:\.\d{1,2})?)|(\d[\d,]*(?:\.\d{1,2})?)\s*(?:dollars|usd|bucks)\b/gi;
const LINK = /https?:\/\/|www\./i;
const REFUND_CLAIM =
  /\b(?:i(?:'ve| have)|we(?:'ve| have))\s+(?:already\s+)?(?:issued|processed|sent|made|approved)\b[^.]{0,30}\brefund|\brefund\s+(?:has been|was|is now)\s+(?:issued|processed|sent|approved|complete)/i;

export type SafetyVerdict = { ok: true } | { ok: false; reason: string };

export function checkReply(text: string, allowedCents: Iterable<Cents>): SafetyVerdict {
  const allowed = new Set(allowedCents);
  if (LINK.test(text)) return { ok: false, reason: 'contains a link' };
  if (REFUND_CLAIM.test(text)) return { ok: false, reason: 'claims a refund already happened' };
  for (const match of text.matchAll(DOLLAR)) {
    const cents = toCents((match[1] ?? match[2]).replaceAll(',', ''));
    if (!allowed.has(cents)) return { ok: false, reason: `mentions an amount that did not come from the engine` };
  }
  return { ok: true };
}

export function safeReply(text: string, allowedCents: Iterable<Cents>, fallback: string) {
  const verdict = checkReply(text, allowedCents);
  return verdict.ok ? { text, replaced: false as const } : { text: fallback, replaced: true as const, reason: verdict.reason };
}
