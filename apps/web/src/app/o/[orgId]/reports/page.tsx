'use client';
import { useState } from 'react';
import Link from 'next/link';
import { BarChart2, CheckCircle2, AlertTriangle, Send, Bot } from 'lucide-react';
import { TASK_STATUS_LABEL, REQUEST_STATE_LABEL, type RequestState } from '@space/shared';
import { useReports } from '@/lib/queries';
import { useOrgId } from '@/lib/org-context';
import { Card, PageHeader, Segmented, Skeleton } from '@/components/ui/primitives';
import { DeptIcon } from '@/components/domain';
import { ago } from '@/lib/utils';
import { format, parseISO, subDays, eachDayOfInterval } from 'date-fns';

/**
 * Every figure on this page is computed from stored records at request time.
 * Charts follow one rule set: single-series bars in the brand colour, values available on hover
 * and as text, no dual axes, and the done/open split always paired with numbers.
 */
const VERB: Record<string, string> = { status_changed: 'moved a task', created: 'created', accept: 'accepted a request', deliver: 'delivered a request', approve: 'approved a delivery' };

export default function ReportsPage() {
  const orgId = useOrgId();
  const [days, setDays] = useState<'7' | '14' | '30'>('14');
  const r = useReports(+days);
  const d = r.data;
  const totals = (d?.departments ?? []).reduce(
    (a: { total: number; done: number; overdue: number; completed: number }, x: any) => ({ total: a.total + x.total, done: a.done + (x.byStatus.done ?? 0), overdue: a.overdue + x.overdue, completed: a.completed + x.completedInWindow }),
    { total: 0, done: 0, overdue: 0, completed: 0 },
  );
  const openReqs = Object.entries(d?.requests ?? {}).filter(([s]) => !['completed', 'rejected', 'cancelled'].includes(s)).reduce((a, [, n]) => a + (n as number), 0);
  const runs = (d?.agentRuns ?? []).reduce((a: number, x: any) => a + x.count, 0);
  const daysList = eachDayOfInterval({ start: subDays(new Date(), +days - 1), end: new Date() });
  const daily = daysList.map((day) => ({ day, n: d?.dailyCompletions.find((x: any) => x.day === format(day, 'yyyy-MM-dd'))?.n ?? 0 }));
  const maxDaily = Math.max(1, ...daily.map((x) => x.n));
  const maxLoad = Math.max(1, ...(d?.workload ?? []).map((w: any) => w.n));

  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader icon={<BarChart2 className="text-powder-ink" />} title="Reports" subtitle="Computed live from your departments’ records — nothing estimated" actions={<Segmented value={days} onChange={setDays} options={[{ value: '7', label: '7 days' }, { value: '14', label: '14 days' }, { value: '30', label: '30 days' }]} />} />
      {r.isLoading || !d ? (
        <div className="grid gap-3 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { icon: CheckCircle2, label: `Tasks completed · ${days}d`, value: totals.completed, tone: 'bg-sage text-sage-ink' },
              { icon: AlertTriangle, label: 'Overdue open tasks', value: totals.overdue, tone: 'bg-rose text-rose-ink' },
              { icon: Send, label: 'Open cross-dept requests', value: openReqs, tone: 'bg-lavender text-lavender-ink' },
              { icon: Bot, label: `Agent runs · ${days}d`, value: runs, tone: 'bg-powder text-powder-ink' },
            ].map((s) => (
              <Card key={s.label} className="flex items-center gap-3 p-4">
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.tone}`}>
                  <s.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-[24px] font-extrabold leading-none">{s.value}</p>
                  <p className="mt-1 text-[12px] text-muted">{s.label}</p>
                </div>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Card className="p-5">
              <p className="text-[14px] font-bold">Tasks completed per day</p>
              <p className="text-[12px] text-muted">Hover a bar for the exact count</p>
              <div className="mt-4 flex h-44 items-end gap-1.5 border-b border-line" role="img" aria-label="Tasks completed per day">
                {daily.map((x) => (
                  <div key={x.day.toISOString()} className="group relative flex flex-1 flex-col items-center justify-end" style={{ height: '100%' }}>
                    <span className="pointer-events-none absolute -top-1 z-10 -translate-y-full whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] font-semibold text-white opacity-0 transition group-hover:opacity-100">
                      {format(x.day, 'MMM d')}: {x.n}
                    </span>
                    <div className="w-full max-w-[22px] rounded-t-[4px]" style={{ height: `${(x.n / maxDaily) * 100}%`, minHeight: x.n ? 4 : 0, background: 'var(--brand)' }} />
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex justify-between text-[10.5px] text-muted">
                <span>{format(daily[0].day, 'MMM d')}</span>
                <span>{format(daily[daily.length - 1].day, 'MMM d')}</span>
              </div>
            </Card>
            <Card className="p-5">
              <p className="text-[14px] font-bold">Open work per person</p>
              <p className="text-[12px] text-muted">Assigned tasks not yet done — a workload indicator, not monitoring</p>
              <div className="mt-3 space-y-2">
                {d.workload.slice(0, 8).map((w: any) => (
                  <div key={w.memberId} className="grid grid-cols-[120px_1fr_28px] items-center gap-2 text-[12.5px]">
                    <span className="truncate">{w.name}</span>
                    <div className="h-2.5 rounded-full bg-bg">
                      <div className="h-full rounded-full" style={{ width: `${(w.n / maxLoad) * 100}%`, background: 'var(--brand)' }} />
                    </div>
                    <span className="text-right font-semibold">{w.n}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="px-5 pt-4">
              <p className="text-[14px] font-bold">Departments</p>
            </div>
            <div className="overflow-x-auto">
              <table className="mt-2 w-full min-w-[760px] text-[12.5px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                    <th className="px-5 py-2 font-semibold">Department</th>
                    {(['todo', 'in_progress', 'in_review', 'blocked', 'done'] as const).map((s) => (
                      <th key={s} className="px-2 py-2 text-right font-semibold">{TASK_STATUS_LABEL[s]}</th>
                    ))}
                    <th className="px-2 py-2 text-right font-semibold">Overdue</th>
                    <th className="px-5 py-2 font-semibold">Done / total</th>
                  </tr>
                </thead>
                <tbody>
                  {d.departments.map((x: any) => {
                    const done = x.byStatus.done ?? 0;
                    return (
                      <tr key={x.id} className="border-b border-line last:border-0">
                        <td className="px-5 py-2.5">
                          <Link href={`/o/${orgId}/departments/${x.id}`} className="flex items-center gap-2 font-semibold hover:underline">
                            <DeptIcon theme={x.theme} color={x.color} size={24} /> {x.name}
                          </Link>
                        </td>
                        {(['todo', 'in_progress', 'in_review', 'blocked', 'done'] as const).map((s) => (
                          <td key={s} className="px-2 py-2.5 text-right tabular-nums">{x.byStatus[s] ?? 0}</td>
                        ))}
                        <td className={`px-2 py-2.5 text-right tabular-nums ${x.overdue ? 'font-semibold text-rose-ink' : ''}`}>{x.overdue}</td>
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="flex h-2 w-32 gap-[2px] overflow-hidden rounded-full">
                              <div style={{ width: `${x.total ? (done / x.total) * 100 : 0}%`, background: 'var(--sage-ink)' }} />
                              <div className="flex-1 bg-line" />
                            </div>
                            <span className="tabular-nums text-muted">{done}/{x.total}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <p className="mb-3 text-[14px] font-bold">Requests by state</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(d.requests).map(([s, n]) => (
                  <div key={s} className="flex items-center justify-between rounded-xl bg-bg-soft px-3 py-2 text-[12.5px]">
                    <span>{REQUEST_STATE_LABEL[s as RequestState]}</span>
                    <span className="font-bold tabular-nums">{n as number}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-5">
              <p className="text-[14px] font-bold">Daily highlights · last 24h</p>
              <p className="mb-3 text-[12px] text-muted">Factual activity records</p>
              {!d.highlights.length && <p className="text-[12.5px] text-muted">No activity in the last 24 hours.</p>}
              <ul className="space-y-1.5">
                {d.highlights.slice(0, 10).map((h: any) => (
                  <li key={h.id} className="text-[12.5px]">
                    <span className="font-semibold">{h.actor ?? 'Someone'}</span> {VERB[h.verb] ?? h.verb.replace(/_/g, ' ')}
                    {h.verb === 'status_changed' && h.data?.to ? ` to ${TASK_STATUS_LABEL[h.data.to as keyof typeof TASK_STATUS_LABEL]}` : ''}
                    {h.title ? <> · <span className="text-ink-2">{h.title}</span></> : null} <span className="text-muted">· {ago(h.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          <p className="text-[11.5px] text-muted">Generated {format(parseISO(d.generatedAt), 'MMM d, h:mm a')}. Written summaries from a reporting agent appear in that run’s result.</p>
        </div>
      )}
    </div>
  );
}
