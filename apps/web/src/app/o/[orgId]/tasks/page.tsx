'use client';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ListChecks, LayoutList, Columns3, Plus, Search } from 'lucide-react';
import { TASK_STATUS_LABEL, PRIORITIES, type TaskStatus } from '@space/shared';
import { useTasks, useOrg } from '@/lib/queries';
import { Button, Card, PageHeader, Segmented, Select, Skeleton, ErrorState } from '@/components/ui/primitives';
import { Board, NewTaskDialog, TaskList } from '@/components/tasks';

export default function MyTasksPage() {
  const sp = useSearchParams();
  const org = useOrg();
  const [scope, setScope] = useState<'mine' | 'all'>(sp.get('scope') === 'all' ? 'all' : 'mine');
  const [view, setView] = useState<'list' | 'board'>('list');
  const [status, setStatus] = useState<string>(sp.get('status') ?? 'open');
  const [priority, setPriority] = useState('any');
  const [dept, setDept] = useState('any');
  const [q, setQ] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<TaskStatus>('todo');

  const tasks = useTasks({
    assignee: scope === 'mine' ? 'me' : undefined,
    status: status !== 'open' && status !== 'any' ? status : undefined,
    priority: priority !== 'any' ? priority : undefined,
    departmentId: dept !== 'any' ? dept : undefined,
    q: q.length >= 2 ? q : undefined,
    parentId: 'root',
  });
  const list = useMemo(() => (tasks.data ?? []).filter((t) => (status === 'open' && view === 'list' ? t.status !== 'done' : true)), [tasks.data, status, view]);
  const counts = useMemo(() => {
    const all = tasks.data ?? [];
    return { open: all.filter((t) => t.status !== 'done').length, done: all.filter((t) => t.status === 'done').length };
  }, [tasks.data]);
  const readable = (org.data?.departments ?? []).filter((d) => d.canRead);

  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader
        icon={<ListChecks className="text-powder-ink" />}
        title={scope === 'mine' ? 'My Tasks' : 'All visible tasks'}
        subtitle={scope === 'mine' ? 'Tasks assigned to you or where you collaborate' : 'Every task in departments you belong to'}
        actions={
          org.data?.me.role !== 'viewer' && (
            <Button
              variant="primary"
              onClick={() => {
                setNewStatus('todo');
                setNewOpen(true);
              }}
            >
              <Plus /> New task
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={scope} onChange={setScope} options={[{ value: 'mine', label: 'Assigned to me' }, { value: 'all', label: 'All' }]} />
        <Segmented value={view} onChange={setView} options={[{ value: 'list', label: <span className="flex items-center gap-1.5"><LayoutList className="h-3.5 w-3.5" />List</span> }, { value: 'board', label: <span className="flex items-center gap-1.5"><Columns3 className="h-3.5 w-3.5" />Board</span> }]} />
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by title" aria-label="Filter tasks" className="h-9 w-52 rounded-xl border border-line bg-surface pl-8 pr-3 text-[13px] outline-none focus:ring-4 focus:ring-brand/10" />
        </div>
        {view === 'list' && (
          <Select
            className="h-9 w-40"
            value={status}
            onValueChange={setStatus}
            aria-label="Status filter"
            options={[{ value: 'open', label: `Open (${counts.open})` }, { value: 'any', label: 'Any status' }, ...Object.entries(TASK_STATUS_LABEL).map(([v, l]) => ({ value: v, label: l }))]}
          />
        )}
        <Select className="h-9 w-36" value={priority} onValueChange={setPriority} aria-label="Priority filter" options={[{ value: 'any', label: 'Any priority' }, ...PRIORITIES.map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }))]} />
        <Select className="h-9 w-44" value={dept} onValueChange={setDept} aria-label="Department filter" options={[{ value: 'any', label: 'All departments' }, ...readable.map((d) => ({ value: d.id, label: d.name }))]} />
      </div>
      {tasks.error ? (
        <ErrorState error={tasks.error} retry={() => tasks.refetch()} />
      ) : tasks.isLoading ? (
        <Card className="space-y-3 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </Card>
      ) : view === 'list' ? (
        <Card className="overflow-hidden">
          <TaskList tasks={list} emptyTitle={scope === 'mine' ? 'Nothing assigned to you' : 'No tasks match these filters'} />
        </Card>
      ) : (
        <Board
          tasks={tasks.data ?? []}
          onCreate={
            org.data?.me.role !== 'viewer'
              ? (s) => {
                  setNewStatus(s);
                  setNewOpen(true);
                }
              : undefined
          }
        />
      )}
      <NewTaskDialog open={newOpen} onOpenChange={setNewOpen} status={newStatus} />
    </div>
  );
}
