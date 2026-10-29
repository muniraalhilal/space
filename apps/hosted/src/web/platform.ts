/**
 * Supabase-backed implementations of the capabilities the in-page backend uses (db, user, files,
 * downloads), so the same Space code runs as a normal public website.
 */
import { supabase } from './supabase';

type Doc = { id: string; exists: boolean; data(): Record<string, unknown> | undefined };
type Listener = (snap: { docs: Doc[] }) => void;

const maps = new Map<string, Map<string, Record<string, unknown>>>();
const listeners = new Map<string, Set<Listener>>();
let channelStarted = false;

const mapFor = (c: string) => {
  if (!maps.has(c)) maps.set(c, new Map());
  return maps.get(c)!;
};
const docOf = (id: string, d: Record<string, unknown> | undefined): Doc => ({ id, exists: !!d, data: () => d });
function emit(c: string) {
  const snap = { docs: [...mapFor(c).entries()].map(([id, d]) => docOf(id, d)) };
  listeners.get(c)?.forEach((f) => f(snap));
}

function friendly(e: { code?: string; message?: string } | null) {
  if (!e) return null;
  const m = e.message ?? 'Saving failed';
  if (e.code === '42501' || /row-level security/i.test(m)) return { code: 'denied', message: 'You don’t have access to change that.' };
  if (e.code === 'P0001') return { code: 'denied', message: m };
  return { code: 'unavailable', message: m };
}

function startChannel() {
  if (channelStarted) return;
  channelStarted = true;
  supabase
    .channel('space-docs')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, (p: any) => {
      const row = p.eventType === 'DELETE' ? p.old : p.new;
      if (!row?.collection) return;
      const m = mapFor(row.collection);
      if (p.eventType === 'DELETE') m.delete(row.id);
      else m.set(row.id, row.data);
      emit(row.collection);
    })
    .subscribe();
}

async function loadAll(c: string) {
  const m = mapFor(c);
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('docs').select('id,data').eq('collection', c).range(from, from + 999);
    if (error) throw friendly(error);
    for (const r of data ?? []) m.set(r.id, r.data as Record<string, unknown>);
    if (!data || data.length < 1000) break;
  }
}

function orgIdOf(collection: string, id: string, data: Record<string, unknown>) {
  if (collection === 'organizations') return id;
  return typeof data.orgId === 'string' ? data.orgId : null;
}

async function put(collection: string, id: string, data: Record<string, unknown>) {
  const known = mapFor(collection).has(id);
  mapFor(collection).set(id, data);
  emit(collection);
  const org_id = orgIdOf(collection, id, data);
  // Plain insert for new rows (an upsert would also need read access to the row before it exists).
  let { error } = known
    ? await supabase.from('docs').update({ data, org_id }).eq('collection', collection).eq('id', id)
    : await supabase.from('docs').insert({ collection, id, org_id, data });
  if (error?.code === '23505') ({ error } = await supabase.from('docs').update({ data, org_id }).eq('collection', collection).eq('id', id));
  if (error) {
    await refetchOne(collection, id);
    throw friendly(error);
  }
}
async function refetchOne(collection: string, id: string) {
  const { data } = await supabase.from('docs').select('data').eq('collection', collection).eq('id', id).maybeSingle();
  if (data) mapFor(collection).set(id, data.data as Record<string, unknown>);
  else mapFor(collection).delete(id);
  emit(collection);
}

/** `data/users/<uid>/space` (the per-viewer path) maps to the private identities row. */
function privatePath(path: string) {
  const m = path.match(/^data\/users\/([^/]+)\/space$/);
  return m ? { collection: 'identities', id: m[1] } : null;
}

const db = {
  collection(name: string) {
    return {
      doc: (id: string) => ({
        set: (d: Record<string, unknown>) => put(name, id, d),
        async delete() {
          mapFor(name).delete(id);
          emit(name);
          const { error } = await supabase.from('docs').delete().eq('collection', name).eq('id', id);
          if (error) {
            await refetchOne(name, id);
            throw friendly(error);
          }
        },
      }),
      onSnapshot(next: Listener, err?: (e: { code: string; message: string }) => void) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name)!.add(next);
        startChannel();
        loadAll(name)
          .then(() => emit(name))
          .catch((e) => {
            err?.(e);
            emit(name);
          });
        return () => listeners.get(name)?.delete(next);
      },
    };
  },
  doc(path: string) {
    const p = privatePath(path);
    if (!p) throw new TypeError(`Unsupported document path ${path}`);
    return {
      async get() {
        const { data } = await supabase.from('docs').select('data').eq('collection', p.collection).eq('id', p.id).maybeSingle();
        return docOf(p.id, (data?.data as Record<string, unknown>) ?? undefined);
      },
      set: (d: Record<string, unknown>) => put(p.collection, p.id, d),
    };
  },
};

export async function webCaps() {
  const { data } = await supabase.auth.getSession();
  const u = data.session?.user;
  if (!u) return { platform: 'web' as const, db: null };
  const meta = (u.user_metadata ?? {}) as { name?: string };
  return {
    platform: 'web' as const,
    db,
    user: {
      id: async () => u.id,
      name: async () => meta.name || (u.email ?? '').split('@')[0],
      email: async () => u.email ?? null,
    },
    sample: null,
    assets: {
      async upload(blob: Blob, o: { type?: string; orgId?: string } = {}) {
        const id = `${o.orgId}/${crypto.randomUUID()}`;
        const { error } = await supabase.storage.from('files').upload(id, blob, { contentType: o.type || blob.type, upsert: false });
        if (error) throw { message: error.message };
        return { id, sizeBytes: blob.size, url: '' };
      },
      async delete(id: string) {
        await supabase.storage.from('files').remove([id]);
      },
    },
    assetUrl: async (id: string) => {
      const { data: s, error } = await supabase.storage.from('files').createSignedUrl(id, 3600);
      if (error || !s) throw { message: error?.message ?? 'File not found' };
      return s.signedUrl;
    },
    downloads: {
      async save({ filename, data }: { filename: string; data: Blob }) {
        const url = URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      },
    },
    signOut: async () => {
      await supabase.auth.signOut();
      location.reload();
    },
  };
}
