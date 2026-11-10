'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CaseListRow, Results } from '@/lib/cases/queries';
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
  const res = await fetch(url, init);
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
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <div role="tablist" className="flex gap-1 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px flex items-center gap-1.5 border-b px-3 py-2 text-sm ${
              tab === t.id ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {t.label}
            {t.badge ? <span className="text-xs text-warn">{t.badge}</span> : null}
          </button>
        ))}
      </div>

      {problem && !cases && (
        <p className="mt-5 rounded-md bg-bad-soft p-3 text-sm text-bad">
          {problem} If this is a fresh checkout, finish the steps in docs/setup.md (database, then <span className="font-mono">npm run db:migrate</span>).
        </p>
      )}

      <div className="mt-5">
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
      <form className="card w-full p-6" onSubmit={(event) => { event.preventDefault(); setBusy(true); setError(null); void onLogin(token).catch((e) => setError(e instanceof Error ? e.message : 'Login failed')).finally(() => setBusy(false)); }}>
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
    <section aria-label="PayPal webhooks" className="mt-10 border-t border-line pt-4 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-muted">PayPal webhooks</span>
        <span className={offline ? 'text-bad' : 'text-muted'}>{offline ? 'Reconnecting…' : 'Live'}</span>
      </div>
      {events.length === 0 ? (
        <p className="mt-2 text-muted">None received yet.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {events.map((e) => (
            <li key={e.id} className="flex items-center gap-3">
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
