'use client';

import { useState } from 'react';
import type { CaseListRow } from '@/lib/cases/queries';
import { formatUsd, toCents } from '@/lib/money';
import { api } from './console';
import { COMPLAINT_LABELS, label, OUTCOME_LABELS } from './labels';

export function ApprovalsPanel({
  cases,
  onOpen,
  onChanged,
}: {
  cases: CaseListRow[] | null;
  onOpen: (id: string) => void;
  onChanged: () => Promise<void>;
}) {
  if (!cases) return <p className="text-sm text-muted">Loading…</p>;
  const queue = cases.filter((c) => c.status === 'waiting_on_approval');
  if (queue.length === 0) {
    return <div className="card p-8 text-center text-sm text-muted">Nothing is waiting for you. Cases over your limits show up here.</div>;
  }
  return (
    <ul className="space-y-4">
      {queue.map((c) => (
        <ApprovalCard key={c.id} row={c} onOpen={onOpen} onChanged={onChanged} />
      ))}
    </ul>
  );
}

function ApprovalCard({ row, onOpen, onChanged }: { row: CaseListRow; onOpen: (id: string) => void; onChanged: () => Promise<void> }) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const blocked = row.guardrail === 'blocked';
  const noDecision = row.guardrail === null;
  const pays = row.proposedRefundCents > 0;

  async function decide(body: object) {
    setBusy(true);
    setResult(null);
    try {
      const out = await api<{ ok: boolean; message?: string; reason?: string }>('/api/console/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setResult({ ok: out.ok, text: out.message ?? out.reason ?? '' });
      await onChanged();
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : 'Something went wrong' });
    } finally {
      setBusy(false);
    }
  }

  const override = amount.trim() ? toCents(amount) : undefined;
  const approveLabel = override ? `Approve ${formatUsd(override)}` : pays ? `Approve ${formatUsd(row.proposedRefundCents)}` : 'Approve';

  return (
    <li className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">{row.items}</p>
          <p className="text-sm text-muted">
            {row.buyerEmail} · {label(COMPLAINT_LABELS, row.complaintType) || 'Not classified'} · order total {formatUsd(row.amountAtStakeCents)}
          </p>
        </div>
        {blocked && <span className="text-sm text-bad">Blocked by a guardrail</span>}
      </div>

      <p className="mt-3 whitespace-pre-line text-sm">{row.summary}</p>

      <div className="mt-3 rounded-lg bg-paper p-3 text-sm">
        <p>
          <span className="text-muted">Proposed: </span>
          <span className="font-medium">{label(OUTCOME_LABELS, row.outcome) || 'No proposal'}</span>
          {pays && <span className="font-medium"> · {formatUsd(row.proposedRefundCents)}</span>}
        </p>
        {row.guardrailReasons.length > 0 && (
          <ul className="mt-1 list-disc pl-5 text-xs text-muted">
            {row.guardrailReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" disabled={busy || blocked || noDecision} onClick={() => void decide({ action: 'approve', caseId: row.id, amountCents: override })}>
          {approveLabel}
        </button>
        {pays && !blocked && (
          <label className="flex items-center gap-1 whitespace-nowrap text-sm text-muted">
            or change to $
            <input className="field w-24" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
          </label>
        )}
        <button className="btn btn-quiet" disabled={busy} onClick={() => void decide({ action: 'decline', caseId: row.id })}>
          Decline
        </button>
        <button className="btn btn-quiet ml-auto" onClick={() => onOpen(row.id)}>
          Details
        </button>
      </div>
      {result && <p className={`mt-3 rounded-md p-3 text-sm ${result.ok ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad'}`}>{result.text}</p>}
    </li>
  );
}
