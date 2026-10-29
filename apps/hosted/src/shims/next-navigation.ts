import { useMemo } from 'react';
import { back, navigate, useLocation } from './router';

export function usePathname() {
  return useLocation().pathname;
}
export function useSearchParams() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}
const router = {
  push: (href: string, _opts?: unknown) => navigate(href),
  replace: (href: string, _opts?: unknown) => navigate(href, true),
  back: () => back(),
  forward: () => undefined,
  refresh: () => undefined,
  prefetch: () => undefined,
};
export function useRouter() {
  return router;
}
export function redirect(href: string): never {
  navigate(href, true);
  throw new Error('redirect');
}
export function notFound(): never {
  throw new Error('Not found');
}
