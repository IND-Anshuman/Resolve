'use client';

import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { useMemo, useState } from 'react';
import type { CaseListRow } from '@/lib/cases/queries';
import { formatUsd } from '@/lib/money';
import { COMPLAINT_LABELS, GUARDRAIL_LABELS, label, OUTCOME_LABELS, STATUS_LABELS, STATUS_STYLES, statusKey, type StatusKey } from './labels';

const money = (p: { value?: number | null }) => (p.value == null ? '' : formatUsd(p.value));

function StatusPill({ data }: ICellRendererParams<CaseListRow>) {
  if (!data) return null;
  const key = statusKey(data);
  // Colour only, no badge: the text colour from the status style carries the meaning.
  const color = STATUS_STYLES[key].split(' ').find((c) => c.startsWith('text-'));
  return <span className={color}>{STATUS_LABELS[key]}</span>;
}

const COLUMNS: ColDef<CaseListRow>[] = [
  { headerName: 'Updated', field: 'updatedAt', width: 100, minWidth: 90, sort: 'desc', valueFormatter: (p) => new Date(p.value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
  { headerName: 'Status', width: 150, cellStyle: { display: 'flex', alignItems: 'center' }, cellRenderer: StatusPill, valueGetter: (p) => (p.data ? STATUS_LABELS[statusKey(p.data)] : '') },
  { headerName: 'Complaint', field: 'complaintType', width: 150, valueFormatter: (p) => label(COMPLAINT_LABELS, p.value) },
  { headerName: 'Order', field: 'items', width: 200, minWidth: 140 },
  { headerName: 'Buyer', field: 'buyerEmail', width: 170, minWidth: 120 },
  { headerName: 'At stake', field: 'amountAtStakeCents', width: 110, type: 'rightAligned', valueFormatter: money },
  { headerName: 'Chosen option', field: 'outcome', width: 150, valueFormatter: (p) => label(OUTCOME_LABELS, p.value) },
  { headerName: 'Expected cost', field: 'expectedCostCents', width: 130, type: 'rightAligned', valueFormatter: money },
  { headerName: 'Saved vs holding', field: 'savedCents', width: 140, type: 'rightAligned', valueFormatter: money },
  { headerName: 'Refunded', field: 'refundedCents', width: 110, type: 'rightAligned', valueFormatter: (p) => (p.value ? formatUsd(p.value) : '') },
  { headerName: 'Guardrails', field: 'guardrail', width: 140, valueFormatter: (p) => label(GUARDRAIL_LABELS, p.value) },
];

const FILTERS: { id: 'all' | StatusKey; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'waiting_on_approval', label: 'Needs approval' },
  { id: 'processing_refund', label: 'Refund in progress' },
  { id: 'processing_approval', label: 'Approval in progress' },
  { id: 'waiting_on_buyer', label: 'Waiting on buyer' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'became_dispute', label: 'Became dispute' },
  { id: 'blocked', label: 'Blocked' },
];

export function CasesPanel({ cases, onOpen }: { cases: CaseListRow[] | null; onOpen: (id: string) => void }) {
  const [filter, setFilter] = useState<'all' | StatusKey>('all');

  const counts = useMemo(() => {
    const out: Record<string, number> = { all: cases?.length ?? 0 };
    for (const c of cases ?? []) out[statusKey(c)] = (out[statusKey(c)] ?? 0) + 1;
    return out;
  }, [cases]);

  const rows = useMemo(() => (filter === 'all' ? cases : cases?.filter((c) => statusKey(c) === filter)) ?? [], [cases, filter]);

  if (!cases) return <p className="text-sm text-muted">Loading cases…</p>;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {FILTERS.filter((f) => f.id === 'all' || counts[f.id]).map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} className={filter === f.id ? 'text-ink underline underline-offset-4' : 'text-muted hover:text-ink'}>
            {f.label} <span className="text-muted">{counts[f.id] ?? 0}</span>
          </button>
        ))}
      </div>
      {cases.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted">
          No cases yet. Place an order in the store, then complain about it in the buyer chat.
        </div>
      ) : (
        <div className="card overflow-hidden" style={{ height: 460 }}>
          <AgGridReact<CaseListRow>
            rowData={rows}
            columnDefs={COLUMNS}
            getRowId={(p) => p.data.id}
            onRowClicked={(e) => e.data && onOpen(e.data.id)}
            rowStyle={{ cursor: 'pointer' }}
            defaultColDef={{ resizable: true, sortable: true, filter: true, minWidth: 90 }}
            autoSizeStrategy={{ type: 'fitGridWidth' }}
            animateRows
          />
        </div>
      )}
      <p className="mt-2 text-xs text-muted">Open a case to see the transcript, the decision math and the PayPal log.</p>
    </div>
  );
}
