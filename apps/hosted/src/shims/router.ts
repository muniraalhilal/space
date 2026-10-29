/**
 * In-page router used in place of the Next.js App Router. The artifact runs as one page, so the
 * "URL" lives in memory (and a plain #view name is mirrored to the address bar for top-level views).
 */
import { useSyncExternalStore } from 'react';

type Loc = { pathname: string; search: string };
let loc: Loc = { pathname: '/', search: '' };
const subs = new Set<() => void>();
const history: Loc[] = [];

function parse(href: string, base: Loc): Loc {
  if (href.startsWith('?')) return { pathname: base.pathname, search: href.slice(1) };
  if (href.startsWith('#')) return base;
  const [p, q = ''] = href.split('?');
  return { pathname: p || base.pathname, search: q.split('#')[0] };
}

export function navigate(href: string, replace = false) {
  const next = parse(href, loc);
  if (next.pathname === loc.pathname && next.search === loc.search) return;
  if (!replace) history.push(loc);
  loc = next;
  try {
    sessionStorage.setItem('space:loc', JSON.stringify(loc));
  } catch {
    /* storage may be unavailable */
  }
  subs.forEach((f) => f());
  if (!replace && next.pathname !== history[history.length - 1]?.pathname) {
    document.getElementById('main')?.scrollTo?.({ top: 0 });
  }
}
export function back() {
  const prev = history.pop();
  if (prev) {
    loc = prev;
    subs.forEach((f) => f());
  }
}
export function restoreLocation() {
  try {
    const s = sessionStorage.getItem('space:loc');
    if (s) loc = JSON.parse(s);
  } catch {
    /* ignore */
  }
}
function subscribe(f: () => void) {
  subs.add(f);
  return () => subs.delete(f);
}
export function useLocation() {
  return useSyncExternalStore(subscribe, () => loc);
}
export function currentLocation() {
  return loc;
}
