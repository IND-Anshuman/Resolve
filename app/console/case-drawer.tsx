'use client';

import type { ColDef } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { useCallback, useEffect, useState } from 'react';
import { withBase } from '@/lib/base-path';
import type { CaseDetail, CaseListRow } from '@/lib/cases/queries';
import { formatUsd } from '@/lib/money';
import { gridTheme } from './ag';
import { api } from './console';
import { COMPLAINT_LABELS, GUARDRAIL_LABELS, label, OUTCOME_LABELS } from './labels';

type OptionRow = CaseDetail['decisions'][number]['options'][number] & { chosen: boolean };

const OPTION_COLUMNS: ColDef<OptionRow>[] = [
  { headerName: 'Option', field: 'kind', width: 150, valueFormatter: (p) => label(OUTCOME_LABELS, p.value) },
  { headerName: 'How it is priced', field: 'formula', flex: 2, minWidth: 200, wrapText: true, autoHeight: true, cellStyle: { fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: '1.5', padding: '8px 12px' } },
  { headerName: 'Expected cost', field: 'expectedCostCents', width: 130, type: 'rightAligned', valueFormatter: (p) => formatUsd(p.value) },
  {
    headerName: 'Result',
    flex: 1.4,
    minWidth: 170,
    wrapText: true,
    autoHeight: true,
    valueGetter: (p) => (p.data?.chosen ? 'Chosen' : p.data?.unfairReason ? `Not allowed: ${p.data.unfairReason}` : ''),
    cellStyle: (p) => (p.value === 'Chosen' ? { color: 'var(--good)', fontWeight: '600', lineHeight: '1.4', padding: '8px 12px' } : { color: 'var(--muted)', fontWeight: '400', lineHeight: '1.4', padding: '8px 12px' }),
  },
];

export function CaseDrawer({ caseId, row, onClose }: { caseId: string; row?: CaseListRow; onClose: () => void }) {
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let loading = false;
    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        const detail = await api<CaseDetail>(`/api/console/cases?id=${caseId}`);
        if (live) setDetail(detail);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : 'Could not load case details');
      } finally {
        loading = false;
      }
    };
    void load();
    const timer = setInterval(load, 5000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [caseId]);

  // Play the exit animation before unmounting.
  const [closing, setClosing] = useState(false);
  const close = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 240);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const latest = detail?.decisions[0];

  return (
    <div className="drawer-backdrop fixed inset-0 z-50 flex justify-end bg-ink/25 backdrop-blur-[3px]" data-closing={closing} onClick={close}>
      <aside
        role="dialog"
        aria-label="Case details"
        className="drawer-panel h-full w-full max-w-3xl overflow-y-auto border-l border-line bg-paper p-6 shadow-[-24px_0_60px_-20px_rgb(20_19_43/0.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{row?.items ?? 'Case'}</h2>
            <p className="text-sm text-muted">
              {row?.buyerEmail} · {label(COMPLAINT_LABELS, row?.complaintType ?? null) || 'Not classified yet'}
            </p>
            {row && <p className="mt-1 font-mono text-xs text-muted">{row.paypalOrderId}</p>}
          </div>
          <button className="btn btn-quiet" onClick={close}>
            Close
          </button>
        </div>

        {row?.summary && (
          <section className="card mt-4 p-4">
            <h3 className="text-xs text-muted">Summary</h3>
            <p className="mt-1 whitespace-pre-line text-sm">{row.summary}</p>
          </section>
        )}

        {error && <p className="mt-4 rounded-md bg-bad-soft p-3 text-sm text-bad">{error}</p>}
        {!detail && !error && (
          <div className="mt-6 space-y-3">
            <div className="skeleton h-28" />
            <div className="skeleton h-40" />
          </div>
        )}

        {detail && (
          <>
            <Section title="Decision math">
              {latest ? (
                <>
                  <div className="card overflow-hidden">
                    <AgGridReact<OptionRow>
                      theme={gridTheme}
                      rowData={latest.options.map((o) => ({ ...o, chosen: o.kind === latest.chosen }))}
                      columnDefs={OPTION_COLUMNS}
                      domLayout="autoHeight"
                      suppressMovableColumns
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    Expected cost uses your odds table in Settings. Plain code picked the cheapest allowed option; the AI only supplied the facts.
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted">No decision yet: the agent is still gathering facts, or handed the case to you.</p>
              )}
            </Section>

            {latest && (
              <Section title={`Guardrails: ${label(GUARDRAIL_LABELS, latest.guardrail)}`}>
                <ul className="card divide-y divide-line text-sm">
                  {latest.checks.map((c) => (
                    <li key={c.name} className="flex items-start gap-3 px-4 py-2">
                      <span className={c.passed ? 'text-good' : 'text-bad'} aria-label={c.passed ? 'Passed' : 'Failed'}>
                        {c.passed ? '✓' : '✗'}
                      </span>
                      <span>
                        <span className="font-medium">{c.name.replaceAll('_', ' ')}</span>
                        <span className="block text-xs text-muted">{c.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <Section title="Transcript">
              <div className="card space-y-3 p-4">
                {detail.messages.map((m) => (
                  <div key={m.id} className="text-sm">
                    <p className="text-xs text-muted">{m.role === 'agent' ? 'Resolve' : m.role === 'seller' ? 'You' : 'Buyer'}</p>
                    {m.hasImage && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={withBase(`/api/attachment?id=${m.id}`)} alt="Photo from the buyer" className="my-1 max-h-56 rounded-md border border-line" />
                    )}
                    <p className="whitespace-pre-line">{m.body}</p>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="PayPal action log">
              {detail.actions.length === 0 ? (
                <p className="text-sm text-muted">No money has moved on this case.</p>
              ) : (
                <ul className="space-y-2">
                  {detail.actions.map((a) => (
                    <li key={a.id} className="card p-4 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium capitalize">{a.kind}</span>
                        <span className={`pill ${a.status === 'succeeded' ? 'bg-good-soft text-good' : a.status === 'failed' ? 'bg-bad-soft text-bad' : 'bg-paper text-muted'}`}>
                          {a.status}
                          {a.httpStatus ? ` · HTTP ${a.httpStatus}` : ''}
                        </span>
                      </div>
                      <p className="mt-1 break-all font-mono text-xs text-muted">PayPal-Request-Id {a.requestId}</p>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-muted">Request and response</summary>
                        <pre className="mt-2 max-h-64 overflow-auto rounded bg-paper p-3 text-xs">{JSON.stringify({ request: a.request, response: a.response }, null, 2)}</pre>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        )}
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rise mt-6">
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      {children}
    </section>
  );
}
