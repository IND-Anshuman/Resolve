'use client';

import type { ColDef } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { useEffect, useState } from 'react';
import { COMPLAINT_TYPES, EVIDENCE_STRENGTHS, type ComplaintType, type DisputeOdds, type EvidenceStrength, type StoreSettings } from '@/lib/settings';
import { api } from './console';
import { COMPLAINT_LABELS } from './labels';

type OddsRow = { complaint: ComplaintType; evidence: EvidenceStrength } & DisputeOdds;

const EVIDENCE_LABELS: Record<EvidenceStrength, string> = { strong: 'Strong evidence', weak: 'Weak evidence', none: 'No evidence' };

// Odds are edited as whole percents, stored as 0 to 1.
const pct = (field: keyof DisputeOdds): ColDef<OddsRow> => ({
  field,
  editable: true,
  width: 150,
  type: 'rightAligned',
  valueGetter: (p) => (p.data ? Math.round(p.data[field] * 100) : 0),
  valueSetter: (p) => {
    const n = Number(p.newValue);
    if (!p.data || !Number.isFinite(n)) return false;
    p.data[field] = Math.min(100, Math.max(0, n)) / 100;
    return true;
  },
  valueFormatter: (p) => `${p.value}%`,
});

const ODDS_COLUMNS: ColDef<OddsRow>[] = [
  { headerName: 'Complaint', field: 'complaint', width: 170, valueFormatter: (p) => COMPLAINT_LABELS[p.value] },
  { headerName: 'Evidence', field: 'evidence', width: 160, valueFormatter: (p) => EVIDENCE_LABELS[p.value as EvidenceStrength] },
  { headerName: 'Buyer disputes if we only hold', ...pct('disputeIfHeld'), width: 230 },
  { headerName: 'We lose that dispute', ...pct('sellerLoses'), width: 190 },
  { headerName: 'Accepts a partial refund', ...pct('acceptsPartial'), width: 200 },
];

const dollars = (cents: number) => (cents / 100).toString();
const toCents = (v: string) => Math.max(0, Math.round(Number(v) * 100) || 0);

export function SettingsPanel() {
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // The grid edits these row objects in place, and Save reads them back.
  const [rows, setRows] = useState<OddsRow[]>([]);

  useEffect(() => {
    api<StoreSettings>('/api/console/settings')
      .then((s) => {
        setSettings(s);
        setRows(
          COMPLAINT_TYPES.flatMap((complaint) =>
            EVIDENCE_STRENGTHS.map((evidence) => ({ complaint, evidence, ...s.probabilities[complaint][evidence] })),
          ),
        );
      })
      .catch((e) => setStatus({ ok: false, text: e.message }));
  }, []);

  if (!settings) return <p className="text-sm text-muted">{status?.text ?? 'Loading…'}</p>;

  const set = <K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) => setSettings({ ...settings, [key]: value });

  async function save() {
    if (!settings) return;
    const probabilities = structuredClone(settings.probabilities);
    for (const r of rows) {
      probabilities[r.complaint][r.evidence] = { disputeIfHeld: r.disputeIfHeld, sellerLoses: r.sellerLoses, acceptsPartial: r.acceptsPartial };
    }
    setSaving(true);
    setStatus(null);
    try {
      setSettings(await api<StoreSettings>('/api/console/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...settings, probabilities }) }));
      setStatus({ ok: true, text: 'Saved. New cases use these numbers straight away.' });
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : 'Could not save' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className={`card p-5 ${settings.killSwitch ? 'border-bad' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Automatic refunds</h2>
            <p className="text-sm text-muted">
              {settings.killSwitch ? 'Switched off. Every refund waits for your approval.' : 'Switched on. Refunds inside your limits go out without you.'}
            </p>
          </div>
          <button className={`btn ${settings.killSwitch ? 'btn-primary' : 'btn-quiet'}`} onClick={() => set('killSwitch', !settings.killSwitch)}>
            {settings.killSwitch ? 'Turn automatic refunds back on' : 'Stop all automatic refunds'}
          </button>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">Limits</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Money label="Auto-refund limit per case" value={settings.autoLimitCents} onChange={(v) => set('autoLimitCents', v)} help="Refunds above this wait for you." />
          <Money label="Daily cap on automatic refunds" value={settings.dailyCapCents} onChange={(v) => set('dailyCapCents', v)} help="Total paid out without you per day (UTC)." />
          <Money label="PayPal dispute fee" value={settings.disputeFeeCents} onChange={(v) => set('disputeFeeCents', v)} help="Used in the cost model. Check your own fee." />
          <Percent label="Largest automatic refund, share of order" value={settings.autoMaxShareOfOrder} onChange={(v) => set('autoMaxShareOfOrder', v)} />
          <Percent label="Partial refund offered, share of order" value={settings.partialRefundShare} onChange={(v) => set('partialRefundShare', v)} />
          <Percent label="Minimum agent confidence" value={settings.minConfidence} onChange={(v) => set('minConfidence', v)} help="Below this the case comes to you." />
          <label className="text-sm">
            <span className="font-medium">Refunds in 90 days that always need approval</span>
            <input className="field mt-1" type="number" min={1} value={settings.repeatRefundThreshold} onChange={(e) => set('repeatRefundThreshold', Math.max(1, Number(e.target.value) || 1))} />
            <span className="mt-1 block text-xs text-muted">Counted per buyer.</span>
          </label>
        </div>
      </section>

      <section>
        <h2 className="font-semibold">Your estimates</h2>
        <p className="mb-3 mt-1 text-sm text-muted">
          These odds drive the cost model. They are guesses until you replace them with what you see in your own disputes. Click a number to change it.
        </p>
        <div className="card overflow-hidden">
          <AgGridReact<OddsRow> rowData={rows} columnDefs={ODDS_COLUMNS} domLayout="autoHeight" autoSizeStrategy={{ type: 'fitGridWidth' }} singleClickEdit stopEditingWhenCellsLoseFocus suppressMovableColumns />
        </div>
      </section>

      <div className="flex items-center gap-4">
        <button className="btn btn-primary" onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        {status && <p className={`text-sm ${status.ok ? 'text-good' : 'text-bad'}`}>{status.text}</p>}
      </div>
    </div>
  );
}

function Money({ label, value, onChange, help }: { label: string; value: number; onChange: (cents: number) => void; help?: string }) {
  return (
    <label className="text-sm">
      <span className="font-medium">{label}</span>
      <div className="relative mt-1">
        <span className="absolute left-3 top-2 text-muted">$</span>
        <input className="field pl-6" inputMode="decimal" defaultValue={dollars(value)} onBlur={(e) => onChange(toCents(e.target.value))} />
      </div>
      {help && <span className="mt-1 block text-xs text-muted">{help}</span>}
    </label>
  );
}

function Percent({ label, value, onChange, help }: { label: string; value: number; onChange: (v: number) => void; help?: string }) {
  return (
    <label className="text-sm">
      <span className="font-medium">{label}</span>
      <div className="relative mt-1">
        <input className="field pr-7" inputMode="numeric" defaultValue={Math.round(value * 100)} onBlur={(e) => onChange(Math.min(1, Math.max(0, (Number(e.target.value) || 0) / 100)))} />
        <span className="absolute right-3 top-2 text-muted">%</span>
      </div>
      {help && <span className="mt-1 block text-xs text-muted">{help}</span>}
    </label>
  );
}
