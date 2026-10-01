// API client with two interchangeable back ends:
//   - server mode: talks to the Keel Node server over HTTPS
//   - demo mode:   runs the identical service layer in the browser with localStorage
// Views never know which one they are using.

const TOKEN_KEY = 'keel.token';
const DEMO_DB_KEY = 'keel.demo.db.v1';
const DEMO_USER_KEY = 'keel.demo.user';

const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
      return true;
    } catch {
      return false;
    }
  },
  del(k) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

class HttpApi {
  constructor() {
    this.mode = 'server';
    this.token = store.get(TOKEN_KEY);
    this.memToken = null;
  }
  get signedIn() {
    return !!(this.token || this.memToken);
  }
  async request(method, path, body, query) {
    const qs = query ? `?${new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''))}` : '';
    const res = await fetch(`/api/${path.replace(/^\/?(api\/)?/, '')}${qs}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(this.token || this.memToken ? { Authorization: `Bearer ${this.token || this.memToken}` } : {}) },
      body: body && method !== 'GET' ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* non-JSON */
    }
    if (res.status === 401 && path !== 'login') {
      this.logoutLocal();
      window.dispatchEvent(new Event('keel:signed-out'));
    }
    if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status})`);
    return data;
  }
  async login(email, password) {
    const r = await this.request('POST', 'login', { email, password });
    this.token = r.token;
    if (!store.set(TOKEN_KEY, r.token)) this.memToken = r.token;
    return r.user;
  }
  logoutLocal() {
    this.token = null;
    this.memToken = null;
    store.del(TOKEN_KEY);
  }
  async logout() {
    try {
      await this.request('POST', 'logout');
    } catch {
      /* ignore */
    }
    this.logoutLocal();
  }
  get(path, query) {
    return this.request('GET', path, null, query);
  }
  post(path, body) {
    return this.request('POST', path, body || {});
  }
  put(path, body) {
    return this.request('PUT', path, body || {});
  }
  del(path) {
    return this.request('DELETE', path);
  }
  async backup() {
    const res = await fetch('/api/backup', { headers: { Authorization: `Bearer ${this.token || this.memToken}` } });
    if (!res.ok) throw new ApiError(res.status, 'Backup failed');
    return res.text();
  }
}

class LocalApi extends HttpApi {
  constructor(mods) {
    super();
    this.mode = 'demo';
    this.mods = mods;
    let db = null;
    const raw = store.get(DEMO_DB_KEY);
    if (raw) {
      try {
        db = JSON.parse(raw);
      } catch {
        db = null;
      }
    }
    if (!db) db = mods.buildDemoDb();
    this.db = db;
    this.persist = () => {
      if (!store.set(DEMO_DB_KEY, JSON.stringify(this.db))) this.volatile = true;
    };
    this.service = mods.createService({ db, onChange: () => this.persist() });
    this.userId = store.get(DEMO_USER_KEY);
  }
  get signedIn() {
    return !!this.userId && this.db.users.some((u) => u.id === this.userId);
  }
  async request(method, path, body, query) {
    const user = this.db.users.find((u) => u.id === this.userId);
    const clean = path.replace(/^\/?(api\/)?/, '');
    const out = this.service.handle(user, method, `/api/${clean}`, body ? JSON.parse(JSON.stringify(body)) : {}, query || {});
    if (out.status === 401) window.dispatchEvent(new Event('keel:signed-out'));
    if (out.status >= 400) throw new ApiError(out.status, out.body?.error || 'Request failed');
    // return a copy so views can't mutate the store by accident
    return out.body === undefined ? null : JSON.parse(JSON.stringify(out.body));
  }
  async login(email) {
    const u = this.db.users.find((x) => x.email.toLowerCase() === String(email || '').toLowerCase());
    if (!u) throw new ApiError(401, 'Unknown demo account — use one of the buttons below');
    this.userId = u.id;
    store.set(DEMO_USER_KEY, u.id);
    this.service.audit(u, 'login', 'users', u.id, 'signed in (demo mode)');
    this.persist();
    const { pwHash, salt, ...pub } = u;
    return pub;
  }
  async logout() {
    this.userId = null;
    store.del(DEMO_USER_KEY);
  }
  async backup() {
    return JSON.stringify(this.db);
  }
  resetDemo() {
    store.del(DEMO_DB_KEY);
    store.del(DEMO_USER_KEY);
  }
}

export let api = null;

export async function initApi() {
  const forced = globalThis.KEEL_MODE;
  if (forced !== 'demo' && location.protocol !== 'file:') {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 2500);
      const r = await fetch('/api/health', { signal: ctl.signal });
      clearTimeout(t);
      const j = await r.json();
      if (j && j.ok) {
        api = new HttpApi();
        return api;
      }
    } catch {
      /* fall through to demo mode */
    }
  }
  const [{ createService }, { buildDemoDb }] = await Promise.all([import('../core/service.js'), import('../core/seed.js')]);
  api = new LocalApi({ createService, buildDemoDb });
  return api;
}
