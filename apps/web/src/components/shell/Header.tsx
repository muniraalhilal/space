'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Bell, Search, Moon, Sun, CheckCheck, Inbox, Bot, Send, ListChecks, MessageCircle } from 'lucide-react';
import { PRESENCE_LABEL, PRESENCE_STATUSES, type PresenceStatus } from '@space/shared';
import { Popover, PopoverContent, PopoverTrigger, Button, Empty, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, Tip } from '@/components/ui/primitives';
import { AvatarPortrait, presenceColor } from '@/components/avatar';
import { DeptIcon } from '@/components/domain';
import { useMembers, useNotifications, useOrg, useTasks, useApiMutation, qk } from '@/lib/queries';
import { useOrgId } from '@/lib/org-context';
import { useUi } from '@/lib/ui-store';
import { api } from '@/lib/api';
import { ago, cn } from '@/lib/utils';
import type { Notification } from '@/lib/types';

export function notificationHref(orgId: string, n: Notification) {
  const base = `/o/${orgId}`;
  if (n.entityType === 'task') return `${base}/tasks?task=${n.entityId}`;
  if (n.entityType === 'request') return `${base}/requests?request=${n.entityId}`;
  if (n.entityType === 'agent_run') return `${base}/agents?run=${n.entityId}`;
  if (n.kind === 'message') return `${base}/messages`;
  return `${base}/notifications`;
}

const KIND_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  request_received: Send,
  request_updated: Send,
  request_comment: Send,
  task_assigned: ListChecks,
  task_updated: ListChecks,
  task_comment: ListChecks,
  message: MessageCircle,
  agent_run_finished: Bot,
  approval_required: Bot,
};

export function NotificationsBell() {
  const orgId = useOrgId();
  const router = useRouter();
  const n = useNotifications();
  const markAll = useApiMutation(() => api.post(`/orgs/${orgId}/notifications/all/read`), () => [qk.notifications(orgId)]);
  const markOne = useApiMutation((id: string) => api.post(`/orgs/${orgId}/notifications/${id}/read`), () => [qk.notifications(orgId)]);
  const unread = n.data?.unread ?? 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-ink-2 hover:bg-surface" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
          <Bell className="h-[19px] w-[19px]" />
          {unread > 0 && <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ef5b6b] px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="text-[14px] font-bold">Notifications</p>
          <Button size="sm" variant="ghost" onClick={() => markAll.mutate(undefined as never)} disabled={!unread}>
            <CheckCheck /> Mark all read
          </Button>
        </div>
        <div className="max-h-[420px] overflow-y-auto p-1.5">
          {!n.data?.items.length && <Empty icon={<Inbox />} title="You’re all caught up" />}
          {n.data?.items.slice(0, 30).map((x) => {
            const I = KIND_ICON[x.kind] ?? Bell;
            return (
              <button
                key={x.id}
                onClick={() => {
                  if (!x.readAt) markOne.mutate(x.id);
                  router.push(notificationHref(orgId, x));
                }}
                className={cn('flex w-full cursor-pointer gap-3 rounded-xl p-2.5 text-left hover:bg-bg', !x.readAt && 'bg-brand-soft/30')}
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg text-ink-2">
                  <I className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold leading-snug text-ink">{x.title}</span>
                  {x.body && <span className="mt-0.5 block truncate text-[12px] text-muted">{x.body}</span>}
                  <span className="mt-0.5 block text-[11px] text-muted-2">{ago(x.createdAt)}</span>
                </span>
                {!x.readAt && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand" />}
              </button>
            );
          })}
        </div>
        <div className="border-t border-line p-2">
          <Link href={`/o/${orgId}/notifications`} className="block rounded-lg py-1.5 text-center text-[12.5px] font-semibold text-brand-ink hover:bg-bg">
            View all
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** ⌘K search across people, departments and tasks the user can see. */
export function GlobalSearch() {
  const orgId = useOrgId();
  const router = useRouter();
  const org = useOrg();
  const members = useMembers();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const tasks = useTasks({ q: q.length >= 2 ? q : undefined, limit: '8' }, q.length >= 2);
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, []);
  const ql = q.toLowerCase();
  const people = useMemo(() => (q ? (members.data ?? []).filter((m) => m.name.toLowerCase().includes(ql) || m.title?.toLowerCase().includes(ql)).slice(0, 5) : []), [q, members.data, ql]);
  const depts = useMemo(() => (q ? (org.data?.departments ?? []).filter((d) => d.name.toLowerCase().includes(ql)).slice(0, 4) : []), [q, org.data, ql]);
  const go = (href: string) => {
    setOpen(false);
    setQ('');
    router.push(href);
  };
  return (
    <div className="relative w-full max-w-[440px]">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        ref={ref}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search for people, tasks, or departments…"
        aria-label="Search"
        className="h-10 w-full rounded-xl border border-line bg-surface pl-10 pr-14 text-[13px] outline-none placeholder:text-muted-2 focus:border-brand/40 focus:ring-4 focus:ring-brand/10"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-line bg-bg px-1.5 py-0.5 text-[10.5px] font-semibold text-muted">⌘K</kbd>
      {open && q && (
        <div className="animate-pop absolute left-0 right-0 top-12 z-50 rounded-2xl border border-line bg-surface p-1.5 shadow-[var(--shadow-lg)]">
          {!people.length && !depts.length && !tasks.data?.length && <p className="px-3 py-4 text-center text-[13px] text-muted">{tasks.isFetching ? 'Searching…' : 'No matches'}</p>}
          {depts.map((d) => (
            <button key={d.id} onMouseDown={() => go(`/o/${orgId}/departments/${d.id}`)} className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-bg">
              <DeptIcon theme={d.theme} color={d.color} size={28} />
              <span className="text-[13px] font-semibold">{d.name}</span>
              <span className="ml-auto text-[11.5px] text-muted">Department</span>
            </button>
          ))}
          {people.map((m) => (
            <button key={m.id} onMouseDown={() => go(`/o/${orgId}/team?member=${m.id}`)} className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-bg">
              <AvatarPortrait name={m.name} size={28} />
              <span className="text-[13px] font-semibold">{m.name}</span>
              <span className="ml-auto truncate text-[11.5px] text-muted">{m.title}</span>
            </button>
          ))}
          {tasks.data?.map((t) => (
            <button key={t.id} onMouseDown={() => go(`/o/${orgId}/tasks?task=${t.id}`)} className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-bg">
              <ListChecks className="h-4 w-4 text-muted" />
              <span className="truncate text-[13px] font-semibold">{t.title}</span>
              <span className="ml-auto truncate text-[11.5px] text-muted">{t.projectName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FocusToggle() {
  const { focusMode, setFocusMode } = useUi();
  return (
    <Tip label={focusMode ? 'Exit Focus Mode' : 'Focus Mode — calmer workspace'} side="bottom">
      <button
        onClick={() => {
          setFocusMode(!focusMode);
          api.patch('/auth/me/preferences', { focusMode: !focusMode }).catch(() => undefined);
        }}
        aria-pressed={focusMode}
        className={cn('flex h-10 cursor-pointer items-center gap-2 rounded-xl px-3 text-[12.5px] font-semibold transition', focusMode ? 'bg-ink text-white' : 'text-ink-2 hover:bg-surface')}
      >
        {focusMode ? <Moon className="h-[17px] w-[17px]" /> : <Sun className="h-[18px] w-[18px] text-[#e8a33d]" />}
        <span className="hidden xl:inline">{focusMode ? 'Focus on' : 'Focus'}</span>
      </button>
    </Tip>
  );
}

export function PresenceMenu() {
  const orgId = useOrgId();
  const org = useOrg();
  const set = useApiMutation((p: PresenceStatus) => api.patch(`/orgs/${orgId}/me`, { presence: p }), () => [qk.org(orgId), qk.members(orgId)]);
  const cur = org.data?.me.presence ?? 'available';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="relative cursor-pointer rounded-full" aria-label={`Your status: ${PRESENCE_LABEL[cur]}`}>
          <AvatarPortrait name={org.data?.me.name} size={38} />
          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-bg" style={{ background: presenceColor[cur] }} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-52">
        <DropdownMenuLabel>Set your status</DropdownMenuLabel>
        {PRESENCE_STATUSES.map((p) => (
          <DropdownMenuItem key={p} onSelect={() => set.mutate(p)}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: presenceColor[p] }} />
            {PRESENCE_LABEL[p]}
            {p === cur && <span className="ml-auto text-[11px] text-muted">current</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
