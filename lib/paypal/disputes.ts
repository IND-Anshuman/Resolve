// Typed Disputes API client. The endpoint is kept in one module so an APIMatic-generated
// client can replace this transport without changing case flow or route handlers.

import { paypalFetch } from './client';

export type Dispute = {
  dispute_id: string;
  status?: string;
  reason?: string;
  dispute_amount?: { currency_code?: string; value?: string };
  disputed_transactions?: { seller_transaction_id?: string }[];
  extensions?: Record<string, unknown>;
};

export type Evidence = {
  evidence_type: string;
  evidence_info?: Record<string, unknown>;
  notes?: string;
};

export type DisputeActionResult = { status?: string; dispute_id?: string } & Record<string, unknown>;

export class PayPalDisputesClient {
  get(disputeId: string) {
    return paypalFetch<Dispute>(`/v1/customer/disputes/${encodeURIComponent(disputeId)}`);
  }

  provideEvidence(disputeId: string, evidence: Evidence[]) {
    return paypalFetch<DisputeActionResult>(`/v1/customer/disputes/${encodeURIComponent(disputeId)}/provide-evidence`, {
      method: 'POST',
      body: { evidence },
    });
  }

  acceptClaim(disputeId: string, note?: string) {
    return paypalFetch<DisputeActionResult>(`/v1/customer/disputes/${encodeURIComponent(disputeId)}/accept-claim`, {
      method: 'POST',
      body: note ? { note } : {},
    });
  }
}

export const paypalDisputes = new PayPalDisputesClient();
