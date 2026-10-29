'use client';
import { use, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { OrgIdProvider, useOrgId } from '@/lib/org-context';
import { useMe, useOrg } from '@/lib/queries';
import { useRealtime } from '@/lib/realtime';
import { useUi } from '@/lib/ui-store';
import { ApiError, api } from '@/lib/api';
import { Sidebar } from '@/components/shell/Sidebar';
import { FocusToggle, GlobalSearch, NotificationsBell, PresenceMenu } from '@/components/shell/Header';
import { GlobalDrawers } from '@/components/drawers/GlobalDrawers';
import { SpaceLogo } from '@/components/brand';
import { cn, tint, shade } from '@/lib/utils';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function Shell({ children }: { children: React.ReactNode }) {
  const org = useOrg();
  const me = useMe();
  const path = usePathname();
  const router = useRouter();
  const focusMode = useUi((s) => s.focusMode);
  const setFocusMode = useUi((s) => s.setFocusMode);
  const orgId = org.data?.organization.id;
  const live = useRealtime(useOrgId());

  useEffect(() => {
    if (me.data?.user.preferences.focusMode !== undefined) setFocusMode(!!me.data.user.preferences.focusMode);
  }, [me.data?.user.preferences.focusMode, setFocusMode]);
  const prefs = me.data?.user.preferences;
  useEffect(() => {
    if (!prefs) return;
    useUi.getState().setReducedMotion(!!prefs.reducedMotion);
    if (prefs.office3d !== undefined) useUi.getState().setView3d(prefs.office3d);
  }, [prefs?.reducedMotion, prefs?.office3d]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (orgId && me.data && me.data.user.preferences.lastOrgId !== orgId) api.patch('/auth/me/preferences', { lastOrgId: orgId }).catch(() => undefined);
  }, [orgId, me.data]);
  useEffect(() => {
    if (me.isError || (org.error instanceof ApiError && org.error.status === 401)) router.replace('/login');
  }, [me.isError, org.error, router]);

  if (org.isLoading)
    return (
      <div className="flex h-screen items-center justify-center">
        <SpaceLogo size={40} className="animate-pulse" />
      </div>
    );
  if (org.error)
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3">
        <p className="text-[15px] font-semibold">This workspace is not available</p>
        <button className="text-[13px] font-semibold text-brand-ink" onClick={() => router.replace('/')}>
          Go to my workspaces
        </button>
      </div>
    );

  const brand = org.data!.organization.brandColor;
  const isHome = path === `/o/${orgId}`;
  const style = { '--brand': brand, '--brand-soft': tint(brand, 0.88), '--brand-ink': shade(brand, 0.28) } as React.CSSProperties;

  return (
    <div className={cn('flex h-screen overflow-hidden', focusMode && 'focus-mode')} style={style}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[64px] shrink-0 items-center gap-4 px-5">
          <div className="hidden min-w-0 shrink-0 lg:block lg:w-[260px]">
            {isHome ? (
              <>
                <p className="truncate text-[17px] font-bold tracking-[-0.01em]">
                  {greeting()}, {org.data!.me.name.split(' ')[0]}
                </p>
                <p className="truncate text-[12px] text-muted">Here’s what’s happening in {org.data!.organization.displayName} today.</p>
              </>
            ) : (
              <p className="truncate text-[13px] font-semibold text-muted">{org.data!.organization.displayName}</p>
            )}
          </div>
          <div className="flex flex-1 justify-center">
            <GlobalSearch />
          </div>
          <div className="flex items-center gap-1.5">
            <span className={cn('mr-1 hidden h-2 w-2 rounded-full sm:block', live ? 'bg-[#4bb07a]' : 'bg-muted-2')} title={live ? 'Live updates connected' : 'Live updates reconnecting'} aria-label={live ? 'Live updates connected' : 'Live updates offline'} />
            <FocusToggle />
            <NotificationsBell />
            <PresenceMenu />
          </div>
        </header>
        <main id="main" className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {children}
        </main>
      </div>
      <GlobalDrawers />
    </div>
  );
}

export default function OrgLayout({ children, params }: { children: React.ReactNode; params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  return (
    <OrgIdProvider value={orgId}>
      <Shell>{children}</Shell>
    </OrgIdProvider>
  );
}
