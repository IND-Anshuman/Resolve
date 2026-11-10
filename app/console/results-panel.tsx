'use client';

import type { AgCartesianChartOptions } from 'ag-charts-community';
import { AgCharts } from 'ag-charts-react';
import type { Results } from '@/lib/cases/queries';
import { formatUsd } from '@/lib/money';

import { CHART } from './ag';

const CLAY = CHART.accent;
const GOOD = CHART.good;
const dollars = (p: { value: number }) => `$${p.value}`;

const base = { background: { fill: 'transparent' }, padding: { top: 10, right: 16, bottom: 4, left: 4 } };

export function ResultsPanel({ results }: { results: Results | null }) {
  if (!results) return <p className="text-sm text-muted">Loading…</p>;
  const { totals, weekly, refunds } = results;

  const dailySpend: AgCartesianChartOptions = {
    ...base,
    data: results.daily,
    series: [
      { type: 'bar', xKey: 'day', yKey: 'refundDollars', yName: 'Refund spend', fill: CLAY, cornerRadius: 6 },
      { type: 'line', xKey: 'day', yKey: 'capDollars', yName: 'Daily cap', stroke: CHART.warn, marker: { enabled: false } },
      { type: 'line', xKey: 'day', yKey: 'feesAvoidedDollars', yName: 'Dispute fees avoided', stroke: GOOD },
    ],
    axes: {
      x: { type: 'category', position: 'bottom' },
      y: { type: 'number', position: 'left', title: { text: 'Dollars' }, label: { formatter: dollars } },
    },
    legend: { enabled: true },
  };

  const weeklyCases: AgCartesianChartOptions = {
    ...base,
    data: weekly,
    series: [{ type: 'bar', xKey: 'week', yKey: 'resolved', yName: 'Cases resolved', fill: CLAY, cornerRadius: 6 }],
    axes: {
      x: { type: 'category', position: 'bottom', title: { text: 'Week starting' } },
      y: { type: 'number', position: 'left', title: { text: 'Cases' }, interval: { minSpacing: 40 } },
    },
    legend: { enabled: false },
  };

  const weeklySaved: AgCartesianChartOptions = {
    ...base,
    data: weekly,
    series: [{ type: 'bar', xKey: 'week', yKey: 'savedDollars', yName: 'Expected saved', fill: GOOD, cornerRadius: 6 }],
    axes: {
      x: { type: 'category', position: 'bottom', title: { text: 'Week starting' } },
      y: { type: 'number', position: 'left', title: { text: 'Dollars' }, label: { formatter: dollars } },
    },
    legend: { enabled: false },
  };

  const refundSplit: AgCartesianChartOptions = {
    ...base,
    data: refunds,
    series: [{ type: 'bar', xKey: 'kind', yKey: 'dollars', yName: 'Refunded', fill: CLAY, cornerRadius: 6 }],
    axes: {
      x: { type: 'category', position: 'bottom' },
      y: { type: 'number', position: 'left', title: { text: 'Dollars refunded' }, label: { formatter: dollars } },
    },
    legend: { enabled: false },
  };

  const empty = totals.resolved === 0 && totals.becameDispute === 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Tile title="Resolved before a dispute" value={String(totals.resolved)} note="Cases closed in the chat or by you" />
        <Tile title="Became a PayPal dispute" value={String(totals.becameDispute)} note="The buyer went to PayPal anyway" />
        <Tile title="Expected savings" value={formatUsd(totals.savedCents)} note="Against explaining and holding, using your odds table" />
      </div>

      {empty ? (
        <div className="card p-8 text-center text-sm text-muted">Charts appear once the first case is resolved.</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Cases resolved per week">
            <AgCharts options={weeklyCases} style={{ height: 260 }} />
          </ChartCard>
          <ChartCard title="Expected savings per week">
            <AgCharts options={weeklySaved} style={{ height: 260 }} />
          </ChartCard>
          <ChartCard title="Automatic vs approved refunds">
            <AgCharts options={refundSplit} style={{ height: 260 }} />
          </ChartCard>
          <ChartCard title="Automatic refund spend vs daily cap">
            <AgCharts options={dailySpend} style={{ height: 260 }} />
          </ChartCard>
          <div className="card p-5 text-sm text-muted">
            <h3 className="font-medium text-ink">How to read these</h3>
            <p className="mt-2">
              Savings are an estimate, not a measurement. Each one compares the option Resolve chose with explaining and holding, using the odds in
              Settings. If your odds are wrong, the savings are too, so tune them to what you see in your own disputes.
            </p>
            <p className="mt-2">Nobody can prove a dispute that never happened, so this counts cases settled in the chat rather than claiming a number of disputes prevented.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <div className="card card-hover relative overflow-hidden p-5">
      <span aria-hidden className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br from-[#8b7bff]/25 to-[#22d3ee]/10 blur-xl" />
      <p className="text-sm text-muted">{title}</p>
      <p className="pop mt-1 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted">{note}</p>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card card-hover p-4">
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      {children}
    </div>
  );
}
