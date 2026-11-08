// The decision engine: plain code that picks the cheapest fair outcome by expected cost.
// The model supplies only the facts (complaint type, evidence strength); it never picks the
// outcome or the amount. "Models propose, code executes."

import { formatUsd, type Cents } from '../money';
import type { ComplaintType, DisputeOdds, EvidenceStrength, StoreSettings } from '../settings';

export const OPTION_KINDS = ['full_refund', 'replacement', 'partial_refund', 'explain_and_hold'] as const;
export type OptionKind = (typeof OPTION_KINDS)[number];

export type DecisionInput = {
  complaintType: ComplaintType;
  evidenceStrength: EvidenceStrength;
  orderTotalCents: Cents;
  // What PayPal says is still refundable on the capture, read live.
  refundableCents: Cents;
  // The seller's cost to send the affected items again.
  itemCostCents: Cents;
  shippingCostCents: Cents;
  replacementAvailable: boolean;
};

export type OptionCost = {
  kind: OptionKind;
  refundCents: Cents;
  expectedCostCents: Cents;
  // Human-readable math for the dashboard, e.g. "0.6 × $15.00 + 0.4 × $26.00".
  formula: string;
  fallback?: OptionKind;
  // Shown for comparison but never chosen, e.g. stalling a buyer who is clearly owed money.
  unfairReason?: string;
};

export type Decision = {
  options: OptionCost[];
  chosen: OptionKind;
  refundCents: Cents;
  // Against "explain and hold", which is what most stressed sellers do by default.
  savedVsHoldCents: Cents;
  odds: DisputeOdds;
};

// With strong evidence and odds this bad for the seller, the buyer is owed something, so
// "explain and hold" is cheaper only because it gambles on the buyer giving up.
const HOLD_UNFAIR_WHEN_SELLER_LOSES = 0.8;

// Which outcomes make sense for each complaint. A partial refund means "keep the item", so it
// needs an item; a change of mind is a return-policy matter, not a refund decision.
const ELIGIBLE: Record<ComplaintType, readonly OptionKind[]> = {
  not_received: ['full_refund', 'replacement', 'explain_and_hold'],
  damaged: OPTION_KINDS,
  wrong_item: OPTION_KINDS,
  not_as_described: OPTION_KINDS,
  changed_mind: ['explain_and_hold'],
  other: ['explain_and_hold'],
};

export function decide(input: DecisionInput, settings: StoreSettings): Decision {
  const odds = settings.probabilities[input.complaintType][input.evidenceStrength];
  const eligible = ELIGIBLE[input.complaintType].filter(
    (kind) => kind !== 'replacement' || input.replacementAvailable,
  );
  const refundable = Math.max(0, input.refundableCents);
  const fee = settings.disputeFeeCents;
  const p = (n: number) => String(Number(n.toFixed(4)));

  const others: OptionCost[] = [];
  for (const kind of eligible) {
    if (kind === 'full_refund' && refundable > 0) {
      others.push({ kind, refundCents: refundable, expectedCostCents: refundable, formula: formatUsd(refundable) });
    } else if (kind === 'replacement') {
      const cost = input.itemCostCents + input.shippingCostCents;
      others.push({
        kind,
        refundCents: 0,
        expectedCostCents: cost,
        formula: `${formatUsd(input.itemCostCents)} + ${formatUsd(input.shippingCostCents)}`,
      });
    } else if (kind === 'explain_and_hold') {
      others.push({
        kind,
        refundCents: 0,
        expectedCostCents: Math.round(odds.disputeIfHeld * (fee + odds.sellerLoses * refundable)),
        formula: `${p(odds.disputeIfHeld)} × (${formatUsd(fee)} + ${p(odds.sellerLoses)} × ${formatUsd(refundable)})`,
        unfairReason:
          input.evidenceStrength === 'strong' && odds.sellerLoses >= HOLD_UNFAIR_WHEN_SELLER_LOSES
            ? 'Strong evidence the buyer is owed a remedy'
            : undefined,
      });
    }
  }

  const options = [...others];
  const partial = Math.min(refundable, Math.round((settings.partialRefundShare * input.orderTotalCents) / 100) * 100);
  if (eligible.includes('partial_refund') && partial > 0 && partial < refundable) {
    // If the buyer refuses the partial refund, the case falls back to the next cheapest fair option.
    const fallback = cheapest(others);
    const accept = odds.acceptsPartial;
    options.push({
      kind: 'partial_refund',
      refundCents: partial,
      expectedCostCents: Math.round(accept * partial + (1 - accept) * fallback.expectedCostCents),
      formula: `${p(accept)} × ${formatUsd(partial)} + ${p(1 - accept)} × ${formatUsd(fallback.expectedCostCents)}`,
      fallback: fallback.kind,
    });
  }

  options.sort((a, b) => OPTION_KINDS.indexOf(a.kind) - OPTION_KINDS.indexOf(b.kind));
  const chosen = cheapest(options);
  const hold = options.find((o) => o.kind === 'explain_and_hold')!;
  return {
    options,
    chosen: chosen.kind,
    refundCents: chosen.refundCents,
    savedVsHoldCents: hold.expectedCostCents - chosen.expectedCostCents,
    odds,
  };
}

// Ties go to the option earlier in OPTION_KINDS, which is the more generous one for the buyer.
// If nothing fair is left (e.g. already fully refunded), hold is the only thing to do.
function cheapest(options: OptionCost[]): OptionCost {
  const fair = options.filter((o) => !o.unfairReason);
  return (fair.length > 0 ? fair : options).reduce((best, o) =>
    o.expectedCostCents < best.expectedCostCents ||
    (o.expectedCostCents === best.expectedCostCents && OPTION_KINDS.indexOf(o.kind) < OPTION_KINDS.indexOf(best.kind))
      ? o
      : best,
  );
}
