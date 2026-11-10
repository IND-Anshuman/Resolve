import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../settings';
import { checkGuardrails, type GuardrailInput } from './guardrails';

const base: GuardrailInput = {
  refundCents: 1500,
  orderTotalCents: 6000,
  refundableCents: 6000,
  captureStatus: 'COMPLETED',
  complaintType: 'damaged',
  confidence: 0.92,
  injectionSuspected: false,
  identityVerified: true,
  otherOpenCaseForOrder: false,
  priorRefundsOnOrder: 0,
  buyerRefundsLast90Days: 0,
  autoRefundedTodayCents: 0,
};

const check = (overrides: Partial<GuardrailInput>, settings = DEFAULT_SETTINGS) =>
  checkGuardrails({ ...base, ...overrides }, settings);

describe('checkGuardrails', () => {
  it('auto-executes the worked example ($15 under a $25 limit)', () => {
    expect(check({})).toMatchObject({ outcome: 'auto_execute', reasons: [] });
  });

  it('sends a $90 refund to approval', () => {
    expect(check({ refundCents: 9000, orderTotalCents: 9000, refundableCents: 9000 }).outcome).toBe('needs_approval');
  });

  it('blocks a refund larger than what is still refundable, whatever the limits', () => {
    expect(check({ refundCents: 50000 }).outcome).toBe('blocked');
  });

  it('blocks a chat that is not tied to the order by order number and email', () => {
    expect(check({ identityVerified: false }).outcome).toBe('blocked');
  });

  it('blocks a second open case on the same order', () => {
    expect(check({ otherOpenCaseForOrder: true }).outcome).toBe('blocked');
  });

  it('blocks refunds on a capture that is not refundable', () => {
    expect(check({ captureStatus: 'REFUNDED' }).outcome).toBe('blocked');
  });

  it.each<[string, Partial<GuardrailInput>]>([
    ['over the share of the order', { refundCents: 2000, orderTotalCents: 3000, refundableCents: 3000 }],
    ['over the daily cap', { autoRefundedTodayCents: 14000 }],
    ['a second refund on the order', { priorRefundsOnOrder: 1 }],
    ['a repeat refunder', { buyerRefundsLast90Days: 2 }],
    ['low confidence', { confidence: 0.5 }],
    ['a suspected prompt injection', { injectionSuspected: true }],
    ['an unclassified complaint', { complaintType: 'other' }],
  ])('needs approval for %s', (_, overrides) => {
    expect(check(overrides).outcome).toBe('needs_approval');
  });

  it('stops every automatic refund when the kill switch is on', () => {
    expect(check({}, { ...DEFAULT_SETTINGS, killSwitch: true }).outcome).toBe('needs_approval');
  });

  it('lets a no-money outcome through without the refund checks', () => {
    const r = check({ refundCents: 0, captureStatus: 'REFUNDED', buyerRefundsLast90Days: 5 });
    expect(r.outcome).toBe('auto_execute');
  });
});
