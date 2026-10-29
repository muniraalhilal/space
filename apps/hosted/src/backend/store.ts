/**
 * Shared data store for the hosted Space page.
 *
 * Every table is a collection in the artifact's `db` (shared by everyone who opens the page, live).
 * The page subscribes once per collection and keeps an in-memory copy; the in-page API reads from
 * that copy and writes through to `db`. Other viewers' writes arrive through the same subscriptions.
 */

export const TABLES = [
  'users',
  'organizations',
  'orgMembers',
  'departments',
  'departmentMembers',
  'officeLayouts',
  'agents',
  'projects',
  'requests',
  'tasks',
  'comments',
  'activities',
  'events',
  'conversations',
  'messages',
  'notifications',
  'files',
  'agentRuns',
  'agentApprovals',
  'integrations',
  'auditLogs',
] as const;
export type TableName = (typeof TABLES)[number];
export type Row = { id: string; [k: string]: any };

type DbDoc = { id: string; exists: boolean; data(): Record<string, unknown> | undefined };
type DbApi = {
  collection(path: string): {
    doc(id: string): { set(d: Record<string, unknown>): Promise<void>; delete(): Promise<void> };
    onSnapshot(next: (s: { docs: DbDoc[] }) => void, err?: (e: { code: string; message: string }) => void): () => void;
  };
};

export class Table<T extends Row = Row> {
  map = new Map<string, T>();
  loaded = false;
  constructor(public readonly name: TableName) {}
  all(): T[] {
    return [...this.map.values()];
  }
  get(id: string | null | undefined): T | undefined {
    return id ? this.map.get(id) : undefined;
  }
  where(pred: (r: T) => boolean): T[] {
    const out: T[] = [];
    for (const r of this.map.values()) if (pred(r)) out.push(r);
    return out;
  }
  find(pred: (r: T) => boolean): T | undefined {
    for (const r of this.map.values()) if (pred(r)) return r;
    return undefined;
  }
  async insert(row: Omit<T, 'id'> & { id?: string }): Promise<T> {
    const r = { ...row, id: row.id ?? uid() } as T;
    this.map.set(r.id, r);
    await store.write(this.name, r);
    return r;
  }
  async update(id: string, patch: Partial<T>): Promise<T> {
    const cur = this.map.get(id);
    if (!cur) throw new Error(`${this.name}/${id} missing`);
    const r = { ...cur, ...patch } as T;
    this.map.set(id, r);
    await store.write(this.name, r);
    return r;
  }
  async remove(id: string) {
    if (!this.map.has(id)) return;
    this.map.delete(id);
    await store.del(this.name, id);
  }
}

export const T = Object.fromEntries(TABLES.map((n) => [n, new Table(n)])) as { [K in TableName]: Table<any> };

export function uid() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
}
export const nowIso = () => new Date().toISOString();

type Listener = (changed: Set<TableName>) => void;

class Store {
  db: DbApi | null = null;
  readOnly = false;
  status: 'connecting' | 'ready' | 'unavailable' = 'connecting';
  error: string | null = null;
  private listeners = new Set<Listener>();
  private pending = new Set<TableName>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readyWaiters: Array<() => void> = [];
  private unsubs: Array<() => void> = [];

  onChange(f: Listener) {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }
  private changed(t: TableName) {
    this.pending.add(t);
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      const set = new Set(this.pending);
      this.pending.clear();
      this.flushTimer = null;
      this.listeners.forEach((f) => f(set));
    }, 30);
  }

  async connect(db: DbApi | null) {
    if (!db) {
      this.status = 'unavailable';
      this.readyWaiters.forEach((f) => f());
      return;
    }
    this.db = db;
    let remaining = TABLES.length;
    for (const name of TABLES) {
      const table = T[name];
      let first = true;
      const unsub = db.collection(name).onSnapshot(
        (snap) => {
          const next = new Map<string, Row>();
          for (const d of snap.docs) {
            const data = d.data();
            if (data) next.set(d.id, { ...(data as Row), id: d.id });
          }
          table.map = next;
          table.loaded = true;
          this.changed(name);
          if (first) {
            first = false;
            if (--remaining === 0) {
              this.status = 'ready';
              this.readyWaiters.forEach((f) => f());
            }
          }
        },
        (e) => {
          this.error = e.message;
          if (first) {
            first = false;
            if (--remaining === 0) {
              this.status = 'ready';
              this.readyWaiters.forEach((f) => f());
            }
          }
        },
      );
      this.unsubs.push(unsub);
    }
  }

  ready() {
    if (this.status !== 'connecting') return Promise.resolve();
    return new Promise<void>((r) => this.readyWaiters.push(r));
  }

  async write(name: TableName, row: Row) {
    this.changed(name);
    if (!this.db) throw new StoreError('Space can’t save changes in this view.');
    const { id, ...data } = row;
    try {
      await this.db.collection(name).doc(id).set(stripUndefined(data));
    } catch (e: any) {
      throw toStoreError(e, this);
    }
  }
  async del(name: TableName, id: string) {
    this.changed(name);
    if (!this.db) throw new StoreError('Space can’t save changes in this view.');
    try {
      await this.db.collection(name).doc(id).delete();
    } catch (e: any) {
      throw toStoreError(e, this);
    }
  }
}

export class StoreError extends Error {}
function toStoreError(e: any, s: Store) {
  if (e?.code === 'invalid_argument' || e?.code === 'not_granted') {
    s.readOnly = true;
    return new StoreError('You have view-only access to this Space, so changes can’t be saved. Ask the owner for Contributor access.');
  }
  if (e?.code === 'quota_exceeded') return new StoreError('This Space has reached its storage limit. Delete old items and try again.');
  if (e?.code === 'resource_exhausted') return new StoreError('Too many changes at once. Wait a moment and try again.');
  return new StoreError(e?.message ?? 'Saving failed. Try again.');
}

function stripUndefined(o: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(o)) as Record<string, unknown>;
}

export const store = new Store();
