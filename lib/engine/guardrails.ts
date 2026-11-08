// Guardrails run in code before any money moves. Every check yields one of three results:
// auto-execute, needs approval, or blocked, and every result carries its reasons for the log.

import { formatUsd, type Cents } from '../money';
import type { ComplaintType, StoreSettings } from '../settings';

export type GuardrailOutcome = 'auto_execute' | 'needs_approval' | 'blocked';

export type GuardrailInput = {
  refundCents: Cents;
  orderTotalCents: Cents;
  // Read live from PayPal at the moment of the check, never from our own database.
  refundableCents: Cents;
  captureStatus: string;
  complaintType: ComplaintType;
  confidence: number;
  // The agent flagged the buyer's text as trying to give it instructions.
  injectionSuspected: boolean;
  // The chat was tied to this order by order number plus the payer's email.
  identityVerified: boolean;
  otherOpenCaseForOrder: boolean;
  priorRefundsOnOrder: number;
  buyerRefundsLast90Days: number;
  autoRefundedTodayCents: Cents;
};

export type GuardrailCheck = {
  name: string;
  passed: boolean;
  // What failing this check leads to.
  onFail: Exclude<GuardrailOutcome, 'auto_execute'>;
  detail: string;
};

export type GuardrailResult = {
  outcome: GuardrailOutcome;
  reasons: string[];
  checks: GuardrailCheck[];
};

const REFUNDABLE_CAPTURE_STATUSES = new Set(['COMPLETED', 'PARTIALLY_REFUNDED']);

export function checkGuardrails(input: GuardrailInput, settings: StoreSettings): GuardrailResult {
  const refund = input.refundCents;
  const movesMoney = refund > 0;
  const checks: GuardrailCheck[] = [
    {
      name: 'identity',
      passed: input.identityVerified,
      onFail: 'blocked',
      detail: 'Order number and payer email must match',
    },
    {
      name: 'one_open_case',
      passed: !input.otherOpenCaseForOrder,
      onFail: 'blocked',
      detail: 'Another case is already open for this order',
    },
    {
      name: 'confidence',
      passed: input.confidence >= settings.minConfidence,
      onFail: 'needs_approval',
      detail: `Assessment confidence ${input.confidence} vs minimum ${settings.minConfidence}`,
    },
    {
      name: 'no_injection_signal',
      passed: !input.injectionSuspected,
      onFail: 'needs_approval',
      detail: 'The buyer message looked like an attempt to instruct the agent',
    },
    {
      name: 'known_complaint_type',
      passed: input.complaintType !== 'other',
      onFail: 'needs_approval',
      detail: 'Unclassified complaints go to the seller',
    },
  ];

  if (movesMoney) {
    const shareLimit = Math.floor(settings.autoMaxShareOfOrder * input.orderTotalCents);
    checks.push(
      {
        name: 'fits_capture',
        passed: refund <= input.refundableCents,
        onFail: 'blocked',
        detail: `Refund ${formatUsd(refund)} vs ${formatUsd(input.refundableCents)} still refundable`,
      },
      {
        name: 'capture_refundable',
        passed: REFUNDABLE_CAPTURE_STATUSES.has(input.captureStatus),
        onFail: 'blocked',
        detail: `Capture status is ${input.captureStatus}`,
      },
      {
        name: 'kill_switch',
        passed: !settings.killSwitch,
        onFail: 'needs_approval',
        detail: 'Automatic refunds are switched off',
      },
      {
        name: 'auto_limit',
        passed: refund <= settings.autoLimitCents,
        onFail: 'needs_approval',
        detail: `Refund ${formatUsd(refund)} vs auto-limit ${formatUsd(settings.autoLimitCents)}`,
      },
      {
        name: 'share_of_order',
        passed: refund <= shareLimit,
        onFail: 'needs_approval',
        detail: `Refund ${formatUsd(refund)} vs ${settings.autoMaxShareOfOrder * 100}% of order (${formatUsd(shareLimit)})`,
      },
      {
        name: 'daily_cap',
        passed: input.autoRefundedTodayCents + refund <= settings.dailyCapCents,
        onFail: 'needs_approval',
        detail: `${formatUsd(input.autoRefundedTodayCents)} refunded today + ${formatUsd(refund)} vs cap ${formatUsd(settings.dailyCapCents)}`,
      },
      {
        name: 'no_prior_refund_on_order',
        passed: input.priorRefundsOnOrder === 0,
        onFail: 'needs_approval',
        detail: `${input.priorRefundsOnOrder} earlier refund(s) on this order`,
      },
      {
        name: 'repeat_refunder',
        passed: input.buyerRefundsLast90Days < settings.repeatRefundThreshold,
        onFail: 'needs_approval',
        detail: `${input.buyerRefundsLast90Days} refund(s) to this buyer in 90 days`,
      },
    );
  }

  const failed = checks.filter((c) => !c.passed);
  const outcome: GuardrailOutcome = failed.some((c) => c.onFail === 'blocked')
    ? 'blocked'
    : failed.length > 0
      ? 'needs_approval'
      : 'auto_execute';
  return { outcome, reasons: failed.map((c) => c.detail), checks };
}
