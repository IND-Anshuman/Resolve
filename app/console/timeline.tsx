'use client';

import { useEffect, useState } from 'react';
import type { TimelineItem } from '@/lib/cases/queries';
import { api } from './console';

const KIND_LABELS = { approval: 'Approval SLA', shipment: 'Parcel re-check', dispute: 'Dispute deadline' } as const;

export function TimelinePanel() {
  const [items, setItems] = useState<TimelineItem[] | null>(null);
  useEffect(() => {
    void api<{ items: TimelineItem[] }>('/api/console/timeline').then((data) => setItems(data.items)).catch(() => setItems([]));
  }, []);

  if (!items) return <div className="skeleton h-40" aria-label="Loading timeline" />;
  return (
    <section className="space-y-4">
      <p className="text-sm text-muted">Approval deadlines, parcel re-checks and PayPal dispute response windows.</p>
      {items.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted">No active deadlines. New approval and in-transit cases will appear here.</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="grid grid-cols-[minmax(180px,1fr)_140px_180px_120px] gap-3 border-b border-line px-4 py-2 text-xs text-muted">
            <span>Milestone</span><span>Order</span><span>Due</span><span>Status</span>
          </div>
          <ul>
            {items.map((item) => (
              <li key={item.id} className="grid transition-colors hover:bg-clay-soft/40 grid-cols-[minmax(180px,1fr)_140px_180px_120px] items-center gap-3 border-b border-line px-4 py-3 text-sm last:border-0">
                <div><p className="font-medium">{item.title}</p><p className="text-xs text-muted">{KIND_LABELS[item.kind]}</p></div>
                <span className="truncate text-muted">{item.order}</span>
                <time dateTime={item.dueAt} className={item.overdue ? 'font-medium text-bad' : 'text-muted'}>{new Date(item.dueAt).toLocaleString()}</time>
                <span className={item.overdue ? 'text-bad' : 'text-muted'}>{item.overdue ? 'Overdue' : 'Upcoming'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
