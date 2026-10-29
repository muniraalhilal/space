// Local stand-in for the claude.ai runtime (window.claude) used ONLY for testing the hosted build
// outside claude.ai. It mimics the documented db / user / sample / assets / downloads shapes.
(function () {
  const seed = window.__SPACE_SEED__ || {};
  const coll = new Map(); // collection path -> Map(id -> data)
  for (const [name, rows] of Object.entries(seed)) {
    const m = new Map();
    for (const r of rows) {
      const { id, ...data } = r;
      m.set(id, JSON.parse(JSON.stringify(data)));
    }
    coll.set(name, m);
  }
  const subs = new Map(); // path -> Set(fn)
  const get = (p) => {
    if (!coll.has(p)) coll.set(p, new Map());
    return coll.get(p);
  };
  const snap = (p) => ({
    docs: [...get(p).entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, d]) => ({ id, exists: true, data: () => d, metadata: { fromCache: false, hasPendingWrites: false } })),
  });
  const emit = (p) => setTimeout(() => (subs.get(p) || new Set()).forEach((f) => f(snap(p))), 0);
  const split = (path) => {
    const s = path.split('/');
    return [s.slice(0, -1).join('/'), s[s.length - 1]];
  };
  const docRef = (path) => {
    const [c, id] = split(path);
    return {
      id,
      path,
      async get() {
        const d = get(c).get(id);
        return { id, exists: !!d, data: () => d, metadata: { fromCache: false, hasPendingWrites: false } };
      },
      async set(data) {
        if (window.__SPACE_READONLY__) throw { code: 'invalid_argument', message: 'read only' };
        get(c).set(id, JSON.parse(JSON.stringify(data)));
        emit(c);
      },
      async update(data) {
        get(c).set(id, { ...get(c).get(id), ...data });
        emit(c);
      },
      async delete() {
        if (window.__SPACE_READONLY__) throw { code: 'invalid_argument', message: 'read only' };
        get(c).delete(id);
        emit(c);
      },
    };
  };
  const db = {
    doc: docRef,
    collection(p) {
      return {
        path: p,
        doc: (id) => docRef(`${p}/${id}`),
        onSnapshot(next) {
          if (!subs.has(p)) subs.set(p, new Set());
          subs.get(p).add(next);
          setTimeout(() => next(snap(p)), 5);
          return () => subs.get(p).delete(next);
        },
      };
    },
  };
  const user = {
    id: async () => 'u_localtestviewer000000001',
    name: async () => 'Test Viewer',
    me: async () => ({ id: 'u_localtestviewer000000001', name: 'Test Viewer' }),
    isOwner: async () => true,
    canEdit: async () => true,
    can: async () => true,
  };
  const sample = Object.assign(
    async (input, opts = {}) => {
      window.__SAMPLE_CALLS__ = (window.__SAMPLE_CALLS__ || 0) + 1;
      const script = window.__SAMPLE_SCRIPT__;
      if (!script) throw { code: 'not_granted', message: 'no fake model' };
      return script(input, opts);
    },
    { limits: async () => ({ maxPromptBytes: 262144, tools: { maxCount: 20 } }) },
  );
  const blobs = new Map();
  const assets = {
    async upload(blob, o = {}) {
      const id = Math.random().toString(16).slice(2).padEnd(32, '0').slice(0, 32);
      blobs.set(id, blob);
      return { id, url: URL.createObjectURL(blob), sizeBytes: blob.size, contentType: o.type || blob.type };
    },
    async delete() {},
  };
  const downloads = { async save(r) { window.__DOWNLOADED__ = r.filename; } };
  const map = { db, user, sample, assets, downloads };
  window.claude = { use: async (n) => (window.__NO_CLAUDE__ ? null : map[n] ?? null) };
  window.__fakeDb = { coll };
})();
