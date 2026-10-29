'use client';
import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Columns3, LayoutList, CalendarDays, Plus, Archive, ChevronLeft, ChevronRight } from 'lucide-react';
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfWeek } from 'date-fns';
import type { TaskStatus } from '@space/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useOrg, useProject, useTasks } from '@/lib/queries';
import { useOrgId } from '@/lib/org-context';
import { api, errorMessage } from '@/lib/api';
import { Button, Card, ErrorState, Segmented, Skeleton, ProgressBar, Select } from '@/components/ui/primitives';
import { DeptIcon, TaskStatusIcon } from '@/components/domain';
import { Board, NewTaskDialog, TaskList, useTaskHref } from '@/components/tasks';
import { cn } from '@/lib/utils';
import type { Task } from '@/lib/types';

export default function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const orgId = useOrgId();
  const router = useRouter();
  const qc = useQueryClient();
  const org = useOrg();
  const project = useProject(projectId);
  const tasks = useTasks({ projectId, parentId: 'root' });
  const [view, setView] = useState<'board' | 'list' | 'calendar'>('board');
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<TaskStatus>('todo');
  const p = project.data;
  const dept = org.data?.departments.find((d) => d.id === p?.departmentId);

  if (project.error) return <ErrorState error={project.error} />;
  if (!p) return <Skeleton className="h-64 w-full" />;
  const all = tasks.data ?? [];
  const done = all.filter((t) => t.status === 'done').length;

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button onClick={() => router.back()} className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl bg-surface shadow-sm hover:bg-bg" aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </button>
        {dept && (
          <Link href={`/o/${orgId}/departments/${dept.id}`}>
            <DeptIcon theme={dept.theme} color={dept.color} size={38} />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[20px] font-bold">{p.name}</h1>
          <p className="text-[12.5px] text-muted">
            {dept?.name} · {done}/{all.length} tasks done{p.dueDate ? ` · target ${format(new Date(p.dueDate), 'MMM d, yyyy')}` : ''}
          </p>
        </div>
        <div className="hidden w-48 items-center gap-2 md:flex">
          <ProgressBar value={all.length ? (done / all.length) * 100 : 0} color={p.color ?? undefined} />
        </div>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'board', label: <span className="flex items-center gap-1.5"><Columns3 className="h-3.5 w-3.5" />Board</span> },
            { value: 'list', label: <span className="flex items-center gap-1.5"><LayoutList className="h-3.5 w-3.5" />List</span> },
            { value: 'calendar', label: <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />Calendar</span> },
          ]}
        />
        {p.canAdmin && (
          <Select
            className="h-9 w-36"
            value={p.status}
            aria-label="Project status"
            onValueChange={async (v) => {
              try {
                await api.patch(`/orgs/${orgId}/projects/${projectId}`, { status: v });
                qc.invalidateQueries({ queryKey: ['project', orgId, projectId] });
                qc.invalidateQueries({ queryKey: ['projects', orgId] });
              } catch (e) {
                toast.error(errorMessage(e));
              }
            }}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'on_hold', label: 'On hold' },
              { value: 'completed', label: 'Completed' },
              { value: 'archived', label: 'Archived' },
            ]}
          />
        )}
        {p.canWrite && (
          <Button
            variant="primary"
            onClick={() => {
              setStatus('todo');
              setOpen(true);
            }}
          >
            <Plus /> New task
          </Button>
        )}
      </div>
      {p.description && <p className="-mt-2 mb-4 max-w-3xl text-[13px] text-ink-2">{p.description}</p>}
      {tasks.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : view === 'board' ? (
        <Board
          tasks={all}
          onCreate={
            p.canWrite
              ? (s) => {
                  setStatus(s);
                  setOpen(true);
                }
              : undefined
          }
        />
      ) : view === 'list' ? (
        <Card className="overflow-hidden">
          <TaskList tasks={all} showProject={false} />
        </Card>
      ) : (
        <MonthCalendar tasks={all} />
      )}
      <NewTaskDialog open={open} onOpenChange={setOpen} projectId={projectId} status={status} />
      {p.status === 'archived' && (
        <p className="mt-4 flex items-center gap-2 text-[12.5px] text-muted">
          <Archive className="h-4 w-4" /> This project is archived.
        </p>
      )}
    </div>
  );
}

function MonthCalendar({ tasks }: { tasks: Task[] }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const href = useTaskHref();
  const days = useMemo(() => eachDayOfInterval({ start: startOfWeek(startOfMonth(month)), end: endOfWeek(endOfMonth(month)) }), [month]);
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Button size="iconSm" variant="ghost" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">
          <ChevronLeft />
        </Button>
        <p className="w-36 text-center text-[14px] font-bold">{format(month, 'MMMM yyyy')}</p>
        <Button size="iconSm" variant="ghost" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">
          <ChevronRight />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-line bg-line">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="bg-bg-soft px-2 py-1.5 text-[11px] font-semibold text-muted">
            {d}
          </div>
        ))}
        {days.map((d) => {
          const key = format(d, 'yyyy-MM-dd');
          const due = tasks.filter((t) => t.dueDate === key);
          return (
            <div key={key} className={cn('min-h-[96px] bg-surface p-1.5', !isSameMonth(d, month) && 'bg-bg-soft/60')}>
              <p className={cn('mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-[11.5px] font-semibold', isToday(d) ? 'bg-brand text-white' : 'text-ink-2')}>{format(d, 'd')}</p>
              {due.slice(0, 3).map((t) => (
                <Link key={t.id} href={href(t.id)} scroll={false} className="mb-0.5 flex items-center gap-1 truncate rounded-md bg-bg px-1.5 py-0.5 text-[11px] font-medium hover:bg-brand-soft">
                  <TaskStatusIcon status={t.status} className="h-3 w-3" /> <span className="truncate">{t.title}</span>
                </Link>
              ))}
              {due.length > 3 && <p className="px-1 text-[10.5px] text-muted">+{due.length - 3} more</p>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
