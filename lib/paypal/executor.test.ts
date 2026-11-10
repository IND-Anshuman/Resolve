import type { Refund, RefundRequest } from '@paypal/paypal-server-sdk';
import { describe, expect, it, vi } from 'vitest';
import { executeRefund, type ExecutorDeps, type RefundCommand } from './executor';
import type { LiveOrder } from './orders';

const liveOrder: LiveOrder = {
  orderId: 'ORDER-1',
  status: 'COMPLETED',
  captureId: 'CAPTURE-1',
  captureStatus: 'COMPLETED',
  currency: 'USD',
  amountCents: 6000,
  refundedCents: 0,
  refundableCents: 6000,
  refundCount: 0,
};

function fakeDeps(overrides: Partial<LiveOrder> = {}) {
  const actions = new Map<string, { status: string; paypalResponse: unknown }>();
  const refundCapture = vi.fn(async (_captureId: string, _requestId: string, body: RefundRequest) => ({
    statusCode: 201,
    result: { id: 'REFUND-1', status: 'COMPLETED', amount: body.amount } as Refund,
  }));
  const deps: ExecutorDeps = {
    getLiveOrder: async () => ({ ...liveOrder, ...overrides }),
    refundCapture,
    findAction: async (id) => actions.get(id),
    saveAction: async (row) => void actions.set(row.requestId, { status: row.status, paypalResponse: row.paypalResponse }),
  };
  return { deps, refundCapture, actions };
}

const cmd: RefundCommand = {
  requestId: 'case-1-v1',
  caseId: 'case-1',
  paypalOrderId: 'ORDER-1',
  amountCents: 1500,
  guardrail: 'auto_execute',
};

describe('executeRefund', () => {
  it('refunds the exact amount with the idempotency key and logs it', async () => {
    const { deps, refundCapture, actions } = fakeDeps();
    const result = await executeRefund(cmd, deps);
    expect(result).toEqual({ ok: true, refundId: 'REFUND-1', status: 'COMPLETED', amountCents: 1500, replayed: false });
    expect(refundCapture).toHaveBeenCalledWith('CAPTURE-1', 'case-1-v1', {
      amount: { currencyCode: 'USD', value: '15.00' },
    });
    expect(actions.get('case-1-v1')?.status).toBe('succeeded');
  });

  it('never calls PayPal twice for the same request id', async () => {
    const { deps, refundCapture } = fakeDeps();
    await executeRefund(cmd, deps);
    const again = await executeRefund(cmd, deps);
    expect(again).toMatchObject({ ok: true, replayed: true, amountCents: 1500 });
    expect(refundCapture).toHaveBeenCalledTimes(1);
  });

  it('refuses blocked decisions and unapproved ones without touching PayPal', async () => {
    const { deps, refundCapture } = fakeDeps();
    expect((await executeRefund({ ...cmd, guardrail: 'blocked', approvedBy: 'seller' }, deps)).ok).toBe(false);
    expect((await executeRefund({ ...cmd, guardrail: 'needs_approval' }, deps)).ok).toBe(false);
    expect(refundCapture).not.toHaveBeenCalled();
  });

  it('runs an approved refund over the limit', async () => {
    const { deps } = fakeDeps();
    const result = await executeRefund({ ...cmd, amountCents: 6000, guardrail: 'needs_approval', approvedBy: 'seller' }, deps);
    expect(result).toMatchObject({ ok: true, amountCents: 6000 });
  });

  it('re-reads PayPal and refuses if the buyer was refunded elsewhere since the decision', async () => {
    const { deps, refundCapture } = fakeDeps({ refundedCents: 5000, refundableCents: 1000 });
    const result = await executeRefund(cmd, deps);
    expect(result.ok).toBe(false);
    expect(refundCapture).not.toHaveBeenCalled();
  });

  it('turns "full" into the live refundable amount', async () => {
    const { deps, refundCapture } = fakeDeps({ refundedCents: 1500, refundableCents: 4500 });
    await executeRefund({ ...cmd, amountCents: 'full', guardrail: 'needs_approval', approvedBy: 'seller' }, deps);
    expect(refundCapture.mock.calls[0][2].amount?.value).toBe('45.00');
  });
});
