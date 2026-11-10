// Turns an assessment into a decision and a guardrail result. Pure: everything it needs is
// passed in, so the whole path from "what the model saw" to "what is allowed to happen" is
// testable without a database or PayPal.

import type { Assessment } from '../agent/assessment';
import { deriveEvidence } from '../agent/evidence';
import type { ShipmentInfo } from '../carrier/simulated';
import type { OrderItem } from '../db/schema';
import { decide, type Decision } from '../engine/decide';
import { checkGuardrails, type GuardrailResult } from '../engine/guardrails';
import { formatUsd, type Cents } from '../money';
import type { LiveOrder } from '../paypal/orders';
import type { EvidenceStrength, StoreSettings } from '../settings';
import { productBySku, SHIPPING_COST_CENTS } from '../store/catalog';

export type PlanInput = {
  assessment: Assessment;
  shipment: ShipmentInfo | null;
  items: OrderItem[];
  live: LiveOrder;
  buyerRefundsLast90Days: number;
  autoRefundedTodayCents: Cents;
  settings: StoreSettings;
};

export type Plan = {
  evidence: EvidenceStrength;
  decision: Decision;
  guardrail: GuardrailResult;
  // Every money figure the buyer may legitimately see in this case.
  allowedAmountsCents: Cents[];
};

// What it costs the seller to send the order's items again. Items missing from the catalog
// are assumed to cost 40% of their price.
export function replacementCost(items: OrderItem[]) {
  const itemCostCents = items.reduce((sum, i) => {
    const product = productBySku(i.sku);
    return sum + (product?.costCents ?? Math.round(i.unitCents * 0.4)) * i.quantity;
  }, 0);
  const inStock = items.every((i) => productBySku(i.sku)?.inStock ?? false);
  return { itemCostCents, shippingCostCents: SHIPPING_COST_CENTS, replacementAvailable: inStock };
}

export function planCase(input: PlanInput): Plan {
  const { assessment, live, settings } = input;
  const evidence = deriveEvidence(assessment, input.shipment);
  const decision = decide(
    {
      complaintType: assessment.complaintType,
      evidenceStrength: evidence,
      orderTotalCents: live.amountCents,
      refundableCents: live.refundableCents,
      ...replacementCost(input.items),
    },
    settings,
  );
  const guardrail = checkGuardrails(
    {
      refundCents: decision.refundCents,
      orderTotalCents: live.amountCents,
      refundableCents: live.refundableCents,
      captureStatus: live.captureStatus ?? 'UNKNOWN',
      complaintType: assessment.complaintType,
      confidence: assessment.confidence,
      injectionSuspected: assessment.injectionSuspected,
      identityVerified: true,
      otherOpenCaseForOrder: false,
      priorRefundsOnOrder: live.refundCount,
      buyerRefundsLast90Days: input.buyerRefundsLast90Days,
      autoRefundedTodayCents: input.autoRefundedTodayCents,
    },
    settings,
  );
  const allowedAmountsCents = [
    live.amountCents,
    decision.refundCents,
    ...input.items.flatMap((i) => [i.unitCents, i.unitCents * i.quantity]),
  ];
  return { evidence, decision, guardrail, allowedAmountsCents };
}

export type OfferView = {
  kind: 'partial_refund' | 'full_refund' | 'replacement';
  title: string;
  detail: string;
  refundCents: Cents;
  // The buyer may decline a partial refund in favour of a replacement.
  canPreferReplacement: boolean;
};

// The card the buyer sees. Written by code, so the amount is always the engine's.
export function describeOffer(
  decision: Pick<Decision, 'options' | 'chosen'>,
  replacementAvailable: boolean,
): OfferView | null {
  const chosen = decision.options.find((o) => o.kind === decision.chosen);
  if (!chosen || chosen.kind === 'explain_and_hold') return null;
  if (chosen.kind === 'partial_refund') {
    return {
      kind: 'partial_refund',
      title: `Keep your order and get ${formatUsd(chosen.refundCents)} back`,
      detail: 'The refund goes back to your original PayPal payment.',
      refundCents: chosen.refundCents,
      canPreferReplacement: replacementAvailable,
    };
  }
  if (chosen.kind === 'replacement') {
    return {
      kind: 'replacement',
      title: 'We will send you a replacement',
      detail: 'Shipped at no cost to you.',
      refundCents: 0,
      canPreferReplacement: false,
    };
  }
  return {
    kind: 'full_refund',
    title: `Full refund of ${formatUsd(chosen.refundCents)}`,
    detail: 'The refund goes back to your original PayPal payment.',
    refundCents: chosen.refundCents,
    canPreferReplacement: false,
  };
}

export const FALLBACK_BUYER_MESSAGE =
  "Thanks for the details, I'm sorry about the trouble. I've looked at your order and I'm working out the best way to put this right.";
