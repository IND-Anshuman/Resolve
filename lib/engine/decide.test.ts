import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../settings';
import { decide, type DecisionInput } from './decide';

// The build guide's worked example: a $60 ceramic mug set arrives cracked, with a photo.
const crackedMugs: DecisionInput = {
  complaintType: 'damaged',
  evidenceStrength: 'strong',
  orderTotalCents: 6000,
  refundableCents: 6000,
  itemCostCents: 1800,
  shippingCostCents: 800,
  replacementAvailable: true,
};

const cost = (d: ReturnType<typeof decide>, kind: string) => d.options.find((o) => o.kind === kind)?.expectedCostCents;

describe('decide', () => {
  it('reproduces the worked example: a $15 partial refund saving $28.90', () => {
    const d = decide(crackedMugs, DEFAULT_SETTINGS);
    expect(cost(d, 'partial_refund')).toBe(1940);
    expect(cost(d, 'replacement')).toBe(2600);
    expect(cost(d, 'explain_and_hold')).toBe(4830);
    expect(cost(d, 'full_refund')).toBe(6000);
    expect(d.chosen).toBe('partial_refund');
    expect(d.refundCents).toBe(1500);
    expect(d.savedVsHoldCents).toBe(2890);
    expect(d.options.find((o) => o.kind === 'partial_refund')?.fallback).toBe('replacement');
  });

  it('refunds a confirmed-lost $90 order in full when there is nothing to replace it with', () => {
    const d = decide(
      { ...crackedMugs, complaintType: 'not_received', orderTotalCents: 9000, refundableCents: 9000, replacementAvailable: false },
      DEFAULT_SETTINGS,
    );
    // Hold is cheaper on paper but unfair with strong evidence; it stays visible for comparison.
    expect(cost(d, 'explain_and_hold')).toBeLessThan(9000);
    expect(d.options.find((o) => o.kind === 'explain_and_hold')?.unfairReason).toBeDefined();
    expect(d.chosen).toBe('full_refund');
    expect(d.refundCents).toBe(9000);
  });

  it('never offers a partial refund for an item that never arrived', () => {
    const d = decide({ ...crackedMugs, complaintType: 'not_received' }, DEFAULT_SETTINGS);
    expect(d.options.map((o) => o.kind)).not.toContain('partial_refund');
  });

  it('explains and holds while a package is still plausibly in transit', () => {
    const d = decide({ ...crackedMugs, complaintType: 'not_received', evidenceStrength: 'weak' }, DEFAULT_SETTINGS);
    expect(d.chosen).toBe('explain_and_hold');
    expect(d.refundCents).toBe(0);
  });

  it('only explains the return policy for a change of mind', () => {
    const d = decide({ ...crackedMugs, complaintType: 'changed_mind' }, DEFAULT_SETTINGS);
    expect(d.options.map((o) => o.kind)).toEqual(['explain_and_hold']);
    expect(d.refundCents).toBe(0);
  });

  it('caps every refund at what is still refundable on the capture', () => {
    const d = decide({ ...crackedMugs, refundableCents: 1000, replacementAvailable: false }, DEFAULT_SETTINGS);
    for (const o of d.options) expect(o.refundCents).toBeLessThanOrEqual(1000);
  });

  it('falls back to hold when the order is already fully refunded', () => {
    const d = decide({ ...crackedMugs, refundableCents: 0, replacementAvailable: false }, DEFAULT_SETTINGS);
    expect(d.chosen).toBe('explain_and_hold');
    expect(d.refundCents).toBe(0);
  });
});
