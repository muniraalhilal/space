/**
 * No-account demo for the public website: every visitor gets their own copy of the demo companies,
 * kept in their own browser (localStorage). Nothing here touches the shared database.
 */
import seed from './demo-seed.json';

const KEY = 'space:demo:v1';
const DAY = 86_400_000;
type Row = Record<string, unknown>;
type Snap = { docs: Array<{ id: string; exists: boolean; data(): Row | undefined }> };

const coll = new Map<string, Map<string, Row>>();
const subs = new Map<string, Set<(s: Snap) => void>>();
const blobs = new Map<string, Blob>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

const get = (c: string) => {
  if (!coll.has(c)) coll.set(c, new Map());
  return coll.get(c)!;
};
const snap = (c: string): Snap => ({ docs: [...get(c).entries()].map(([id, d]) => ({ id, exists: true, data: () => d })) });
const emit = (c: string) => setTimeout(() => subs.get(c)?.forEach((f) => f(snap(c))), 0);
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), data: Object.fromEntries([...coll].map(([c, m]) => [c, Object.fromEntries(m)])) }));
    } catch {
      /* storage full or blocked: the demo keeps working for this visit */
    }
  }, 300);
}

/** Move the seed's dates so "today" in the demo is the visitor's today. */
function shiftDates(rows: unknown, days: number): unknown {
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
  const date = /^\d{4}-\d{2}-\d{2}$/;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      if (iso.test(v)) return new Date(Date.parse(v) + days * DAY).toISOString();
      if (date.test(v)) return new Date(Date.parse(v + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10);
      return v;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(rows);
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved?.data) {
      for (const [c, rows] of Object.entries(saved.data as Record<string, Record<string, Row>>)) coll.set(c, new Map(Object.entries(rows)));
      return;
    }
  } catch {
    /* start fresh */
  }
  const base = Date.parse('2026-10-28T00:00:00Z');
  const days = Math.floor((Date.now() - base) / DAY);
  const data = shiftDates(seed, days) as Record<string, Row[]>;
  for (const [c, rows] of Object.entries(data)) {
    const m = get(c);
    for (const { id, ...d } of rows) m.set(String(id), c === 'users' ? { ...d, demo: true } : d);
  }
  // Start as the demo company admin so every feature is open to explore.
  const munira = [...get('users')].find(([, u]) => u.email === 'munira@juniper.demo');
  if (munira) get('data/users/guest').set('space', { userId: munira[0], preferences: {} });
  persist();
}

const docRef = (c: string, id: string) => ({
  id,
  async get() {
    const d = get(c).get(id);
    return { id, exists: !!d, data: () => d };
  },
  async set(d: Row) {
    get(c).set(id, JSON.parse(JSON.stringify(d)));
    emit(c);
    persist();
  },
  async delete() {
    get(c).delete(id);
    emit(c);
    persist();
  },
});

const db = {
  doc(path: string) {
    const s = path.split('/');
    return docRef(s.slice(0, -1).join('/'), s[s.length - 1]);
  },
  collection(c: string) {
    return {
      doc: (id: string) => docRef(c, id),
      onSnapshot(next: (s: Snap) => void) {
        if (!subs.has(c)) subs.set(c, new Set());
        subs.get(c)!.add(next);
        setTimeout(() => next(snap(c)), 0);
        return () => subs.get(c)?.delete(next);
      },
    };
  },
};

export function resetDemo() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  location.reload();
}

export function demoCaps() {
  load();
  return {
    platform: 'demo' as const,
    db,
    user: { id: async () => 'guest', name: async () => 'Guest' },
    sample: null,
    assets: {
      // Uploaded files stay in memory for this visit only (the demo has no file storage).
      async upload(blob: Blob, o: { type?: string } = {}) {
        const id = crypto.randomUUID().replace(/-/g, '');
        blobs.set(id, blob);
        return { id, sizeBytes: blob.size, url: '', contentType: o.type || blob.type };
      },
      async delete(id: string) {
        blobs.delete(id);
      },
    },
    assetUrl: async (id: string) => {
      const b = blobs.get(id);
      if (!b) throw { message: 'Files uploaded in the demo are only kept until the page is reloaded.' };
      return URL.createObjectURL(b);
    },
    downloads: {
      async save({ filename, data }: { filename: string; data: Blob }) {
        const url = URL.createObjectURL(data);
        const a = Object.assign(document.createElement('a'), { href: url, download: filename });
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      },
    },
  };
}
