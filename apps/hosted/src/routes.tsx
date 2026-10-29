/** Route table standing in for the Next.js App Router file tree. */
import { lazy, Suspense, useMemo, type ComponentType } from 'react';
import { useLocation } from './shims/router';
import Index from '@/app/page';
import OrgLayout from '@/app/o/[orgId]/layout';
import { Welcome } from './welcome';

const page = (f: () => Promise<{ default: ComponentType<any> }>) => lazy(f);
const PAGES: Array<[RegExp, string[], ComponentType<any>]> = [
  [/^\/o\/([^/]+)$/, ['orgId'], page(() => import('@/app/o/[orgId]/page'))],
  [/^\/o\/([^/]+)\/tasks$/, ['orgId'], page(() => import('@/app/o/[orgId]/tasks/page'))],
  [/^\/o\/([^/]+)\/projects$/, ['orgId'], page(() => import('@/app/o/[orgId]/projects/page'))],
  [/^\/o\/([^/]+)\/projects\/([^/]+)$/, ['orgId', 'projectId'], page(() => import('@/app/o/[orgId]/projects/[projectId]/page'))],
  [/^\/o\/([^/]+)\/requests$/, ['orgId'], page(() => import('@/app/o/[orgId]/requests/page'))],
  [/^\/o\/([^/]+)\/calendar$/, ['orgId'], page(() => import('@/app/o/[orgId]/calendar/page'))],
  [/^\/o\/([^/]+)\/messages$/, ['orgId'], page(() => import('@/app/o/[orgId]/messages/page'))],
  [/^\/o\/([^/]+)\/team$/, ['orgId'], page(() => import('@/app/o/[orgId]/team/page'))],
  [/^\/o\/([^/]+)\/agents$/, ['orgId'], page(() => import('@/app/o/[orgId]/agents/page'))],
  [/^\/o\/([^/]+)\/agents\/([^/]+)$/, ['orgId', 'agentId'], page(() => import('@/app/o/[orgId]/agents/[agentId]/page'))],
  [/^\/o\/([^/]+)\/files$/, ['orgId'], page(() => import('@/app/o/[orgId]/files/page'))],
  [/^\/o\/([^/]+)\/reports$/, ['orgId'], page(() => import('@/app/o/[orgId]/reports/page'))],
  [/^\/o\/([^/]+)\/notifications$/, ['orgId'], page(() => import('@/app/o/[orgId]/notifications/page'))],
  [/^\/o\/([^/]+)\/departments\/([^/]+)$/, ['orgId', 'deptId'], page(() => import('@/app/o/[orgId]/departments/[deptId]/page'))],
  [/^\/o\/([^/]+)\/settings$/, ['orgId'], page(() => import('@/app/o/[orgId]/settings/page'))],
  [/^\/o\/([^/]+)\/settings\/departments\/([^/]+)$/, ['orgId', 'deptId'], page(() => import('@/app/o/[orgId]/settings/departments/[deptId]/page'))],
  [/^\/o\/([^/]+)\/preferences$/, ['orgId'], page(() => import('@/app/o/[orgId]/preferences/page'))],
];
const Onboarding = page(() => import('@/app/onboarding/page'));

/** React 19 `use(params)` reads a settled thenable synchronously, so pages never suspend on params. */
const cache = new Map<string, Promise<Record<string, string>>>();
function settled(params: Record<string, string>) {
  const key = JSON.stringify(params);
  let p = cache.get(key) as (Promise<Record<string, string>> & { status?: string; value?: unknown }) | undefined;
  if (!p) {
    p = Promise.resolve(params) as Promise<Record<string, string>> & { status?: string; value?: unknown };
    p.status = 'fulfilled';
    p.value = params;
    cache.set(key, p);
  }
  return p;
}

const Spinner = () => <div className="flex h-full items-center justify-center p-10 text-[13px] text-muted">Loading…</div>;

export function Routes() {
  const { pathname } = useLocation();
  const match = useMemo(() => {
    for (const [re, keys, C] of PAGES) {
      const m = pathname.match(re);
      if (m) return { C, params: Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
    }
    return null;
  }, [pathname]);

  if (pathname === '/login') return <Welcome />;
  if (pathname === '/onboarding')
    return (
      <Suspense fallback={<Spinner />}>
        <Onboarding />
      </Suspense>
    );
  if (match) {
    const { C, params } = match;
    return (
      <OrgLayout key={params.orgId} params={settled({ orgId: params.orgId }) as any}>
        <Suspense fallback={<Spinner />}>
          <C params={settled(params)} />
        </Suspense>
      </OrgLayout>
    );
  }
  return <Index />;
}
