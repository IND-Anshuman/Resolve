import { z } from 'zod';
import { COMPLAINT_TYPES, EVIDENCE_STRENGTHS, type StoreSettings } from './settings';

const prob = z.number().min(0).max(1);
const odds = z.object({ disputeIfHeld: prob, sellerLoses: prob, acceptsPartial: prob });
const byStrength = z.object(Object.fromEntries(EVIDENCE_STRENGTHS.map((s) => [s, odds])) as Record<(typeof EVIDENCE_STRENGTHS)[number], typeof odds>);
const cents = z.number().int().min(0).max(10_000_000);

// What the console may save. Limits are bounded so a typo cannot silently lift every guardrail.
export const settingsSchema: z.ZodType<StoreSettings> = z.object({
  disputeFeeCents: cents,
  autoLimitCents: cents,
  autoMaxShareOfOrder: z.number().min(0).max(1),
  dailyCapCents: cents,
  partialRefundShare: z.number().min(0).max(1),
  repeatRefundThreshold: z.number().int().min(1).max(100),
  minConfidence: z.number().min(0).max(1),
  killSwitch: z.boolean(),
  probabilities: z.object(Object.fromEntries(COMPLAINT_TYPES.map((t) => [t, byStrength])) as Record<(typeof COMPLAINT_TYPES)[number], typeof byStrength>),
});
