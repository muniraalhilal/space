/**
 * Runtime capabilities. On the hosted page they come from the host runtime; on the public web
 * build they come from the Supabase adapter (src/web/platform.ts). Each may be null in a view.
 */
export type Platform = 'hosted' | 'web' | 'demo';
export const caps: {
  platform: Platform;
  db: any;
  user: any;
  sample: any;
  assets: any;
  downloads: any;
  /** Web only: resolve a stored file to a short-lived download URL. */
  assetUrl?: (id: string) => Promise<string>;
  /** Web only: sign out of the account and reload. */
  signOut?: () => Promise<void>;
} = { platform: 'hosted', db: null, user: null, sample: null, assets: null, downloads: null };

export async function loadCaps() {
  if (import.meta.env.VITE_TARGET === 'web') {
    const { webCaps } = await import('../web/platform');
    const w = await webCaps();
    // Signed in → the shared database. Otherwise open the no-account demo, unless the visitor asked to sign in.
    if (w.db || new URLSearchParams(location.search).has('signin')) Object.assign(caps, w);
    else Object.assign(caps, (await import('../web/demo')).demoCaps());
    return caps;
  }
  const c = (globalThis as any).claude;
  if (!c?.use) return caps;
  const [db, user, sample, assets, downloads] = await Promise.all(['db', 'user', 'sample', 'assets', 'downloads'].map((n) => c.use(n).catch(() => null)));
  Object.assign(caps, { db, user, sample, assets, downloads });
  return caps;
}
