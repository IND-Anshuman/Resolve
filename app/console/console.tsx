'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { withBase } from '@/lib/base-path';
import type { CaseListRow, Results } from '@/lib/cases/queries';
import { LogoMark } from '../components/logo';
import { useSlidingIndicator } from '../components/motion';
import { ApprovalsPanel } from './approvals-panel';
import { CaseDrawer } from './case-drawer';
import { CasesPanel } from './cases-panel';
import { registerAg } from './ag';
import { ResultsPanel } from './results-panel';
import { SettingsPanel } from './settings-panel';
import { TimelinePanel } from './timeline';

registerAg();

type WebhookEvent = { id: string; type: string; verified: boolean; receivedAt: string };
type Tab = 'cases' | 'approvals' | 'results' | 'timeline' | 'settings';

const POLL_MS = 4000;

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(withBase(url), init);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? data.reason ?? 'Request failed');
  return data as T;
}

export function Console({ initialCase = null }: { initialCase?: string | null }) {
  const [tab, setTab] = useState<Tab>('cases');
  const [cases, setCases] = useState<CaseListRow[] | null>(null);
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [results, setResults] = useState<Results | null>(null);
  const [offline, setOffline] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [openCase, setOpenCase] = useState<string | null>(initialCase);
  const [requiresLogin, setRequiresLogin] = useState(false);
  const refreshing = useRef(false);
  const { container: tabsRef, style: sliderStyle } = useSlidingIndicator<HTMLDivElement>(tab);

  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const [c, a] = await Promise.all([
        api<{ cases: CaseListRow[] }>('/api/console/cases'),
        api<{ events: WebhookEvent[]; results: Results }>('/api/console/activity'),
      ]);
      setCases(c.cases);
      setEvents(a.events);
      setResults(a.results);
      setOffline(false);
      setProblem(null);
    } catch (e) {
      setOffline(true);
      setProblem(e instanceof Error ? e.message : null);
      setRequiresLogin(e instanceof Error && e.message === 'Console login required');
    } finally {
      refreshing.current = false;
    }
  }, []);

  async function signIn(token: string) {
    await api('/api/console/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
    setRequiresLogin(false);
    await refresh();
  }

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [refresh]);

  if (requiresLogin) return <ConsoleLogin onLogin={signIn} />;

  const waiting = cases?.filter((c) => c.status === 'waiting_on_approval').length ?? 0;
  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'cases', label: 'Cases' },
    { id: 'approvals', label: 'Approvals', badge: waiting },
    { id: 'results', label: 'Results' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Seller console</h1>
          <p className="mt-1 text-sm text-muted">Every case Resolve handled, what it decided, and what is waiting on you.</p>
        </div>
        <span className="eyebrow">
          {offline ? <span className="h-2 w-2 rounded-full bg-bad" /> : <span className="live-dot" />}
          {offline ? 'Reconnecting' : 'Live · updates every 4s'}
        </span>
      </div>
      <div ref={tabsRef} role="tablist" className="relative inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-white/70 p-1 shadow-[var(--shadow-sm)] backdrop-blur">
        <span className="slider bg-ink shadow-[0_4px_12px_-4px_rgb(20_19_43/0.5)]" style={{ ...sliderStyle, top: 4, bottom: 4 }} aria-hidden />
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            data-active={tab === t.id}
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`relative z-10 flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-sm transition-colors duration-300 ${
              tab === t.id ? 'text-white' : 'text-muted hover:text-ink'
            }`}
          >
            {t.label}
            {t.badge ? (
              <span key={t.badge} className="bump rounded-full bg-warn px-1.5 text-[11px] font-semibold leading-[18px] text-white">
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {problem && !cases && (
        <p className="pop mt-5 rounded-xl bg-bad-soft p-3 text-sm text-bad">
          {problem} If this is a fresh checkout, finish the steps in docs/setup.md (database, then <span className="font-mono">npm run db:migrate</span>).
        </p>
      )}

      <div key={tab} className="page-enter mt-6">
        {tab === 'cases' && <CasesPanel cases={cases} onOpen={setOpenCase} />}
        {tab === 'approvals' && <ApprovalsPanel cases={cases} onOpen={setOpenCase} onChanged={refresh} />}
        {tab === 'results' && <ResultsPanel results={results} />}
        {tab === 'timeline' && <TimelinePanel />}
        {tab === 'settings' && <SettingsPanel />}
      </div>

      <ActivityStrip events={events} offline={offline} />

      {openCase && <CaseDrawer caseId={openCase} row={cases?.find((c) => c.id === openCase)} onClose={() => setOpenCase(null)} />}
    </main>
  );
}

function ConsoleLogin({ onLogin }: { onLogin: (token: string) => Promise<void> }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 items-center px-4 py-12">
      <form className="card pop w-full p-7" onSubmit={(event) => { event.preventDefault(); setBusy(true); setError(null); void onLogin(token).catch((e) => setError(e instanceof Error ? e.message : 'Login failed')).finally(() => setBusy(false)); }}>
        <span className="logo-3d mb-4 inline-flex">
          <LogoMark size={44} />
        </span>
        <h1 className="text-xl font-semibold">Seller sign in</h1>
        <p className="mt-2 text-sm text-muted">Enter the console access token configured on the server.</p>
        <input className="field mt-4" type="password" value={token} onChange={(event) => setToken(event.target.value)} autoFocus required aria-label="Console access token" />
        <button className="btn btn-primary mt-4 w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        {error && <p className="mt-3 rounded-md bg-bad-soft p-3 text-sm text-bad">{error}</p>}
      </form>
    </main>
  );
}

function ActivityStrip({ events, offline }: { events: WebhookEvent[]; offline: boolean }) {
  return (
    <section aria-label="PayPal webhooks" className="card mt-10 p-4 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-muted">PayPal webhooks</span>
        <span className={offline ? 'text-bad' : 'text-muted'}>{offline ? 'Reconnecting…' : 'Live'}</span>
      </div>
      {events.length === 0 ? (
        <p className="mt-2 text-muted">None received yet.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {events.map((e) => (
            <li key={e.id} className="fade flex items-center gap-3">
              <span className={e.verified ? 'text-good' : 'text-bad'} title={e.verified ? 'Signature verified' : 'Signature NOT verified'}>
                {e.verified ? '✓' : '✗'}
              </span>
              <span className="font-mono">{e.type}</span>
              <span className="text-muted">{new Date(e.receivedAt).toLocaleTimeString()}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
