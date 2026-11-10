import type { Cents } from './money';

// The seller's own numbers. Every fee and probability is an editable estimate, not a fact:
// the dashboard labels them "your estimates".

export const COMPLAINT_TYPES = [
  'not_received',
  'damaged',
  'wrong_item',
  'not_as_described',
  'changed_mind',
  'other',
] as const;
export type ComplaintType = (typeof COMPLAINT_TYPES)[number];

export const EVIDENCE_STRENGTHS = ['strong', 'weak', 'none'] as const;
export type EvidenceStrength = (typeof EVIDENCE_STRENGTHS)[number];

export type DisputeOdds = {
  // Chance the buyer opens a dispute if the seller only explains and holds.
  disputeIfHeld: number;
  // Chance the seller loses that dispute.
  sellerLoses: number;
  // Chance the buyer accepts a partial refund and keeps the item.
  acceptsPartial: number;
};

export type ProbabilityTable = Record<ComplaintType, Record<EvidenceStrength, DisputeOdds>>;

export type StoreSettings = {
  // Fees (2026 sources: $15 standard dispute fee, $30 high-volume; sources disagree).
  disputeFeeCents: Cents;
  // Refunds at or under this go out without the seller; above it they queue for approval.
  autoLimitCents: Cents;
  // An automatic refund may not exceed this share of the order total.
  autoMaxShareOfOrder: number;
  // Total automatic refunds per day.
  dailyCapCents: Cents;
  // Partial refund offered as a share of the order total, rounded to whole dollars.
  partialRefundShare: number;
  // Buyers with this many refunds in 90 days always go to approval.
  repeatRefundThreshold: number;
  // Assessments below this confidence go to the seller.
  minConfidence: number;
  killSwitch: boolean;
  probabilities: ProbabilityTable;
};

const odds = (disputeIfHeld: number, sellerLoses: number, acceptsPartial: number): DisputeOdds => ({
  disputeIfHeld,
  sellerLoses,
  acceptsPartial,
});

export const DEFAULT_PROBABILITIES: ProbabilityTable = {
  not_received: {
    strong: odds(0.8, 0.95, 0.2),
    weak: odds(0.3, 0.5, 0.2),
    none: odds(0.2, 0.3, 0.2),
  },
  damaged: {
    strong: odds(0.7, 0.9, 0.6),
    weak: odds(0.5, 0.6, 0.5),
    none: odds(0.3, 0.4, 0.4),
  },
  wrong_item: {
    strong: odds(0.7, 0.9, 0.4),
    weak: odds(0.5, 0.6, 0.4),
    none: odds(0.3, 0.4, 0.3),
  },
  not_as_described: {
    strong: odds(0.6, 0.85, 0.5),
    weak: odds(0.4, 0.5, 0.4),
    none: odds(0.25, 0.35, 0.3),
  },
  changed_mind: {
    strong: odds(0.1, 0.1, 0.1),
    weak: odds(0.1, 0.1, 0.1),
    none: odds(0.1, 0.1, 0.1),
  },
  other: {
    strong: odds(0.3, 0.5, 0.3),
    weak: odds(0.2, 0.3, 0.3),
    none: odds(0.1, 0.2, 0.2),
  },
};

export const DEFAULT_SETTINGS: StoreSettings = {
  disputeFeeCents: 1500,
  autoLimitCents: 2500,
  autoMaxShareOfOrder: 0.5,
  dailyCapCents: 15000,
  partialRefundShare: 0.25,
  repeatRefundThreshold: 2,
  minConfidence: 0.7,
  killSwitch: false,
  probabilities: DEFAULT_PROBABILITIES,
};
