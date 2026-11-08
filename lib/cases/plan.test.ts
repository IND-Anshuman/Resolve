import { describe, expect, it } from 'vitest';
import type { Assessment } from '../agent/assessment';
import type { ShipmentInfo } from '../carrier/simulated';
import type { OrderItem } from '../db/schema';
import type { LiveOrder } from '../paypal/orders';
import { DEFAULT_SETTINGS } from '../settings';
import { describeOffer, planCase, type PlanInput } from './plan';

const mugs: OrderItem[] = [{ sku: 'CK-MUG-4', name: 'Ceramic mug set of four', quantity: 1, unitCents: 6000 }];

const live: LiveOrder = {
  orderId: 'O1',
  status: 'COMPLETED',
  captureId: 'C1',
  captureStatus: 'COMPLETED',
  currency: 'USD',
  amountCents: 6000,
  refundedCents: 0,
  refundableCents: 6000,
  refundCount: 0,
};

const crackedMug: Assessment = {
  complaintType: 'damaged',
  confidence: 0.92,
  escalationRisk: 'low',
  photo: { provided: true, quality: 'clear', showsDamage: true, matchesListing: true },
  injectionSuspected: false,
  sellerSummary: 'Cracked mug.',
  buyerMessage: 'Sorry about that.',
};

const shipment = (status: ShipmentInfo['status']): ShipmentInfo => ({
  trackingNumber: `SIM-${status}`,
  carrier: 'USPS (simulated)',
  status,
  summary: status,
  simulated: true,
});

const base: PlanInput = {
  assessment: crackedMug,
  shipment: shipment('delivered'),
  items: mugs,
  live,
  buyerRefundsLast90Days: 0,
  autoRefundedTodayCents: 0,
  settings: DEFAULT_SETTINGS,
};

const plan = (overrides: Partial<PlanInput>) => planCase({ ...base, ...overrides });

describe('planCase: the demo scenarios end to end', () => {
  it('cracked mug with a clear photo: a $15 partial refund that runs automatically', () => {
    const p = plan({});
    expect(p.evidence).toBe('strong');
    expect(p.decision).toMatchObject({ chosen: 'partial_refund', refundCents: 1500, savedVsHoldCents: 2890 });
    expect(p.guardrail.outcome).toBe('auto_execute');
    expect(describeOffer(p.decision, true)).toMatchObject({ kind: 'partial_refund', refundCents: 1500, canPreferReplacement: true });
  });

  it('an unclear photo is weaker evidence and costs the buyer the automatic offer', () => {
    const p = plan({ assessment: { ...crackedMug, photo: { ...crackedMug.photo, quality: 'unclear' } } });
    expect(p.evidence).toBe('weak');
  });

  it('parcel still in transit: explain and hold, nothing paid', () => {
    const p = plan({ assessment: { ...crackedMug, complaintType: 'not_received' }, shipment: shipment('in_transit') });
    expect(p.decision.chosen).toBe('explain_and_hold');
    expect(p.decision.refundCents).toBe(0);
    expect(describeOffer(p.decision, true)).toBeNull();
  });

  it('truly lost $90 parcel: full refund, which needs the seller because it is over the limit', () => {
    const order: OrderItem[] = [{ sku: 'CK-DIN-4', name: 'Dinner plates', quantity: 1, unitCents: 9000 }];
    const p = plan({
      assessment: { ...crackedMug, complaintType: 'not_received', photo: { provided: false, quality: 'none', showsDamage: false, matchesListing: null } },
      shipment: shipment('lost'),
      items: order,
      live: { ...live, amountCents: 9000, refundableCents: 9000 },
    });
    expect(p.evidence).toBe('strong');
    expect(p.decision.chosen).toBe('full_refund');
    expect(p.guardrail.outcome).toBe('needs_approval');
  });

  it('a delivered parcel claimed as not received gets no money', () => {
    const p = plan({ assessment: { ...crackedMug, complaintType: 'not_received' }, shipment: shipment('delivered') });
    expect(p.decision.refundCents).toBe(0);
  });

  it('changed mind outside the window: policy only, no refund', () => {
    const p = plan({ assessment: { ...crackedMug, complaintType: 'changed_mind' } });
    expect(p.decision.chosen).toBe('explain_and_hold');
  });

  it('repeat refunder: same offer, but the seller approves first', () => {
    const p = plan({ buyerRefundsLast90Days: 2 });
    expect(p.decision.chosen).toBe('partial_refund');
    expect(p.guardrail.outcome).toBe('needs_approval');
  });

  it('prompt injection: the claimed amount changes nothing and the seller reviews it', () => {
    const p = plan({
      assessment: { ...crackedMug, complaintType: 'other', injectionSuspected: true, photo: { provided: false, quality: 'none', showsDamage: false, matchesListing: null } },
    });
    expect(p.decision.refundCents).toBe(0);
    expect(p.guardrail.outcome).toBe('needs_approval');
    expect(p.allowedAmountsCents).not.toContain(50000);
  });

  it('a second refund on an already refunded order always needs approval', () => {
    const p = plan({ live: { ...live, refundCount: 1, refundedCents: 1500, refundableCents: 4500 } });
    expect(p.guardrail.outcome).toBe('needs_approval');
  });
});
