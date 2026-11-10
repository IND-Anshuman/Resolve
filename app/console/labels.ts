import type { CaseListRow } from '@/lib/cases/queries';

export const COMPLAINT_LABELS: Record<string, string> = {
  not_received: 'Not received',
  damaged: 'Damaged',
  wrong_item: 'Wrong item',
  not_as_described: 'Not as described',
  changed_mind: 'Changed mind',
  other: 'Other',
};

export const OUTCOME_LABELS: Record<string, string> = {
  partial_refund: 'Partial refund',
  full_refund: 'Full refund',
  replacement: 'Replacement',
  explain_and_hold: 'Explain and hold',
  escalated: 'Sent to seller',
  declined: 'Declined',
  approval_expired: 'Approval expired',
};

export type StatusKey = CaseListRow['status'] | 'blocked';

export const STATUS_LABELS: Record<StatusKey, string> = {
  open: 'Open',
  waiting_on_buyer: 'Waiting on buyer',
  waiting_on_approval: 'Needs approval',
  processing_refund: 'Refund in progress',
  processing_approval: 'Approval in progress',
  blocked: 'Blocked',
  resolved: 'Resolved',
  became_dispute: 'Became dispute',
};

export const STATUS_STYLES: Record<StatusKey, string> = {
  open: 'bg-paper text-muted',
  waiting_on_buyer: 'bg-paper text-muted',
  waiting_on_approval: 'bg-warn-soft text-warn',
  processing_refund: 'bg-warn-soft text-warn',
  processing_approval: 'bg-warn-soft text-warn',
  blocked: 'bg-bad-soft text-bad',
  resolved: 'bg-good-soft text-good',
  became_dispute: 'bg-bad-soft text-bad',
};

// A case a guardrail blocked outright is shown as its own state, because the seller cannot
// approve it the way they can an ordinary over-limit case.
export const statusKey = (c: Pick<CaseListRow, 'status' | 'guardrail'>): StatusKey =>
  c.status === 'waiting_on_approval' && c.guardrail === 'blocked' ? 'blocked' : c.status;

export const GUARDRAIL_LABELS: Record<string, string> = {
  auto_execute: 'Automatic',
  needs_approval: 'Needs approval',
  blocked: 'Blocked',
};

export const label = (map: Record<string, string>, key: string | null) => (key ? (map[key] ?? key) : '');
