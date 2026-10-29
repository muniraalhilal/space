'use client';
import * as React from 'react';
import {
  Code2,
  Palette,
  Megaphone,
  Users,
  BarChart3,
  Settings2,
  Box,
  Building2,
  Circle,
  CircleDot,
  CircleCheck,
  CircleDashed,
  CircleSlash,
  ArrowUp,
  ArrowDown,
  Minus,
  AlertTriangle,
} from 'lucide-react';
import { TASK_STATUS_LABEL, REQUEST_STATE_LABEL, type TaskStatus, type Priority, type RequestState, type DeptTheme } from '@space/shared';
import { Badge, type Tone } from './ui/primitives';
import { AvatarPortrait, RobotPortrait } from './avatar';
import { cn, tint } from '@/lib/utils';
import type { Member, Agent } from '@/lib/types';

export const DEPT_ICON: Record<DeptTheme, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  development: Code2,
  design: Palette,
  marketing: Megaphone,
  hr: Users,
  finance: BarChart3,
  operations: Settings2,
  product: Box,
  general: Building2,
};

/** Department glyph in a soft tinted tile using the department colour. */
export function DeptIcon({ theme, color, size = 32, className }: { theme: DeptTheme; color: string; size?: number; className?: string }) {
  const Icon = DEPT_ICON[theme] ?? Building2;
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center rounded-xl', className)} style={{ width: size, height: size, background: tint(color, 0.72) }}>
      <Icon style={{ width: size * 0.5, height: size * 0.5, color: shadeFor(color) }} />
    </span>
  );
}
function shadeFor(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(c * 0.55);
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
export { shadeFor };

const statusTone: Record<TaskStatus, Tone> = { todo: 'neutral', in_progress: 'powder', in_review: 'lavender', blocked: 'rose', done: 'sage' };
const statusIcon: Record<TaskStatus, React.ComponentType<{ className?: string }>> = { todo: Circle, in_progress: CircleDot, in_review: CircleDashed, blocked: CircleSlash, done: CircleCheck };

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <Badge tone={statusTone[status]}>{TASK_STATUS_LABEL[status]}</Badge>;
}
export function TaskStatusIcon({ status, className }: { status: TaskStatus; className?: string }) {
  const I = statusIcon[status];
  const color = { todo: 'text-muted', in_progress: 'text-powder-ink', in_review: 'text-lavender-ink', blocked: 'text-rose-ink', done: 'text-sage-ink' }[status];
  return <I className={cn('h-4 w-4 shrink-0', color, className)} />;
}

const prioTone: Record<Priority, Tone> = { low: 'sage', medium: 'butter', high: 'peach', urgent: 'rose' };
export function PriorityBadge({ priority }: { priority: Priority }) {
  const I = priority === 'urgent' ? AlertTriangle : priority === 'high' ? ArrowUp : priority === 'low' ? ArrowDown : Minus;
  return (
    <Badge tone={prioTone[priority]}>
      <I className="h-3 w-3" />
      {priority[0].toUpperCase() + priority.slice(1)}
    </Badge>
  );
}

const reqTone: Record<RequestState, Tone> = {
  submitted: 'brand',
  clarification_requested: 'butter',
  accepted: 'lavender',
  in_progress: 'powder',
  delivered: 'peach',
  changes_requested: 'butter',
  completed: 'sage',
  rejected: 'rose',
  cancelled: 'neutral',
};
export function RequestStateBadge({ state }: { state: RequestState }) {
  return (
    <Badge tone={reqTone[state]} dot>
      {REQUEST_STATE_LABEL[state]}
    </Badge>
  );
}

/** Renders the assignee (member or agent) of a task with a consistent portrait. */
export function AssigneeChip({ memberId, agentId, members, agents, size = 24, withName }: { memberId: string | null; agentId: string | null; members?: Member[]; agents?: Agent[]; size?: number; withName?: boolean }) {
  if (memberId) {
    const m = members?.find((x) => x.id === memberId);
    if (!m) return <span className="inline-block rounded-full bg-line" style={{ width: size, height: size }} />;
    return (
      <span className="inline-flex items-center gap-2" title={m.name}>
        <AvatarPortrait name={m.name} size={size} />
        {withName && <span className="text-[12.5px] font-medium text-ink-2">{m.name}</span>}
      </span>
    );
  }
  if (agentId) {
    const a = agents?.find((x) => x.id === agentId);
    return (
      <span className="inline-flex items-center gap-2" title={a ? `${a.name} (AI agent)` : 'AI agent'}>
        <RobotPortrait config={a?.robot} size={size} />
        {withName && <span className="text-[12.5px] font-medium text-ink-2">{a?.name ?? 'Agent'}</span>}
      </span>
    );
  }
  return withName ? <span className="text-[12.5px] text-muted">Unassigned</span> : <span className="inline-block rounded-full border border-dashed border-line-strong" style={{ width: size, height: size }} title="Unassigned" />;
}
