// Optional outbound events for Zapier. Notifications are deliberately best-effort:
// a Zapier outage must never block a buyer reply or a PayPal refund.

export type ResolveEvent =
  | {
      type: 'case.needs_approval';
      caseId: string;
      orderId: string;
      amountCents: number;
      reason: string;
      approvalUrl: string;
    }
  | {
      type: 'refund.issued';
      caseId: string | null;
      refundId: string;
      amountCents: number;
      approvedBy?: string;
    }
  | {
      type: 'dispute.opened';
      disputeId: string;
      caseId?: string;
      orderId?: string;
      reason?: string;
    };

const appUrl = () => (process.env.APP_URL ?? process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export async function emitZapierEvent(event: ResolveEvent): Promise<boolean> {
  const url = process.env.ZAPIER_WEBHOOK_URL;
  if (!url) return false;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: event.type,
        sent_at: new Date().toISOString(),
        app: 'Resolve',
        console_url: `${appUrl()}/console`,
        ...event,
        ...(event.type === 'case.needs_approval' ? { approval_url: `${appUrl()}/console?case=${event.caseId}` } : {}),
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) console.warn(`Zapier webhook returned ${response.status} for ${event.type}`);
    return response.ok;
  } catch (error) {
    console.warn(`Zapier notification failed for ${event.type}`, error);
    return false;
  }
}
