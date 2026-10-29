'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  Home,
  ListChecks,
  FolderKanban,
  Send,
  CalendarDays,
  MessageCircle,
  Users,
  Bot,
  FileText,
  BarChart2,
  Settings,
  ChevronsUpDown,
  LogOut,
  SlidersHorizontal,
  Plus,
  Check,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Tip } from '@/components/ui/primitives';
import { AvatarPortrait } from '@/components/avatar';
import { SpaceLogo } from '@/components/brand';
import { useConversations, useMe, useOrg, useRequests } from '@/lib/queries';
import { useOrgId } from '@/lib/org-context';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const ROLE_LABEL = { company_admin: 'Company Admin', employee: 'Employee', viewer: 'Viewer' } as const;

export function Sidebar() {
  const orgId = useOrgId();
  const path = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const org = useOrg();
  const me = useMe();
  const convs = useConversations();
  const reqs = useRequests('incoming', 'open');
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1180px)');
    const f = () => setCollapsed(mq.matches);
    f();
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);

  const unreadMsgs = convs.data?.reduce((a, c) => a + c.unread, 0) ?? 0;
  const actionable = reqs.data?.filter((r) => r.actions.some((a) => ['accept', 'approve', 'start', 'deliver', 'provide_clarification'].includes(a))).length ?? 0;
  const base = `/o/${orgId}`;
  const nav = [
    { href: base, label: 'Home', icon: Home, exact: true },
    { href: `${base}/tasks`, label: 'My Tasks', icon: ListChecks },
    { href: `${base}/projects`, label: 'Projects', icon: FolderKanban },
    { href: `${base}/requests`, label: 'Requests', icon: Send, badge: actionable },
    { href: `${base}/calendar`, label: 'Calendar', icon: CalendarDays },
    { href: `${base}/messages`, label: 'Messages', icon: MessageCircle, badge: unreadMsgs },
    { href: `${base}/team`, label: 'Team', icon: Users },
    { href: `${base}/agents`, label: 'AI Agents', icon: Bot },
    { href: `${base}/files`, label: 'Files', icon: FileText },
    { href: `${base}/reports`, label: 'Reports', icon: BarChart2 },
  ];
  const o = org.data;

  async function signOut() {
    await api.post('/auth/logout').catch(() => undefined);
    qc.clear();
    router.replace('/login');
  }

  return (
    <aside className={cn('flex h-full shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200', collapsed ? 'w-[68px]' : 'w-[224px]')}>
      <div className={cn('flex h-[64px] items-center gap-1', collapsed ? 'justify-center px-2' : 'px-3.5')}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-left hover:bg-bg" aria-label="Switch company">
              <SpaceLogo size={30} color={o?.organization.brandColor} />
              {!collapsed && (
                <>
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="truncate text-[15px] font-extrabold tracking-[-0.02em]">{o?.organization.displayName ?? 'Space'}</div>
                    {o?.organization.isDemo && <div className="text-[10.5px] font-semibold uppercase tracking-wider text-peach-ink">Demo workspace</div>}
                  </div>
                  <ChevronsUpDown className="h-3.5 w-3.5 text-muted" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Your companies</DropdownMenuLabel>
            {me.data?.organizations.map((x) => (
              <DropdownMenuItem
                key={x.id}
                onSelect={async () => {
                  await api.patch('/auth/me/preferences', { lastOrgId: x.id }).catch(() => undefined);
                  router.push(`/o/${x.id}`);
                }}
              >
                <span className="h-5 w-5 rounded-md" style={{ background: x.brandColor }} />
                <span className="flex-1 truncate">{x.name} Space</span>
                {x.id === orgId && <Check className="!text-brand" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => router.push('/onboarding')}>
              <Plus /> Create a company
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-2" aria-label="Main">
        {nav.map((n) => {
          const active = n.exact ? path === n.href : path.startsWith(n.href);
          const link = (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition',
                active ? 'bg-brand-soft text-brand-ink' : 'text-ink-2 hover:bg-bg hover:text-ink',
                collapsed && 'justify-center px-0',
              )}
            >
              <n.icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-brand' : 'text-muted group-hover:text-ink-2')} />
              {!collapsed && <span className="flex-1">{n.label}</span>}
              {!!n.badge && (
                <span className={cn('flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#ef5b6b] px-1 text-[10.5px] font-bold text-white', collapsed && 'absolute ml-6 -mt-5')}>{n.badge > 9 ? '9+' : n.badge}</span>
              )}
            </Link>
          );
          return collapsed ? (
            <Tip key={n.href} label={n.label}>
              <div className="relative">{link}</div>
            </Tip>
          ) : (
            link
          );
        })}
        <div className="my-2 h-px bg-line" />
        {(() => {
          const href = `${base}/settings`;
          const active = path.startsWith(href);
          const l = (
            <Link href={href} className={cn('group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition', active ? 'bg-brand-soft text-brand-ink' : 'text-ink-2 hover:bg-bg', collapsed && 'justify-center px-0')}>
              <Settings className={cn('h-[18px] w-[18px]', active ? 'text-brand' : 'text-muted')} />
              {!collapsed && 'Settings'}
            </Link>
          );
          return collapsed ? <Tip label="Settings">{l}</Tip> : l;
        })()}
      </nav>

      <div className="border-t border-line p-2.5">
        <button onClick={() => setCollapsed(!collapsed)} className="mb-1 flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-[12px] font-semibold text-muted hover:bg-bg" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <PanelLeftOpen className="mx-auto h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!collapsed && 'Collapse'}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={cn('flex w-full cursor-pointer items-center gap-2.5 rounded-xl p-2 text-left hover:bg-bg', collapsed && 'justify-center')} aria-label="Account menu">
              <AvatarPortrait name={o?.me.name} size={34} />
              {!collapsed && (
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-[13px] font-bold">{o?.me.name}</div>
                  <div className="truncate text-[11.5px] text-muted">{o ? ROLE_LABEL[o.me.role] : ''}</div>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-60">
            <DropdownMenuItem onSelect={() => router.push(`${base}/preferences`)}>
              <SlidersHorizontal /> Preferences
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={signOut}>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
