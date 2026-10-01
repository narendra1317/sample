import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore, createApp } from '../server/index.js';

let app;
let base;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-'));

before(async () => {
  const store = openStore({ dataFile: path.join(dir, 'keel.json'), resetDemo: true, log: () => {} });
  app = createApp({ store, log: () => {} });
  await new Promise((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${app.server.address().port}`;
});
after(() => {
  app.flush();
  app.server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const j = async (method, url, body, token) => {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
};

test('health, static app shell and security headers', async () => {
  assert.equal((await j('GET', '/api/health')).body.ok, true);
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Keel/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  const core = await fetch(`${base}/core/cpm.js`);
  assert.equal(core.status, 200);
  const trav = await fetch(`${base}/%2e%2e/server/auth.js`);
  assert.notEqual(trav.status, 200);
});

test('authentication is required and passwords are checked', async () => {
  assert.equal((await j('GET', '/api/bootstrap')).status, 401);
  assert.equal((await j('POST', '/api/login', { email: 'pm@demo.keel', password: 'wrong' })).status, 401);
  const ok = await j('POST', '/api/login', { email: 'pm@demo.keel', password: 'keel-demo-2026' });
  assert.equal(ok.status, 200);
  const boot = await j('GET', '/api/bootstrap', null, ok.body.token);
  assert.equal(boot.status, 200);
  assert.equal(boot.body.projects.length, 3);
  assert.ok(!('pwHash' in boot.body.users[0]), 'hashes never leave the server');
  const pf = await j('GET', '/api/portfolio', null, ok.body.token);
  assert.equal(pf.body.length, 3);
  const out = await j('POST', '/api/logout', null, ok.body.token);
  assert.equal(out.status, 200);
  assert.equal((await j('GET', '/api/bootstrap', null, ok.body.token)).status, 401);
});

test('writes persist to the data file', async () => {
  const { body } = await j('POST', '/api/login', { email: 'planner@demo.keel', password: 'keel-demo-2026' });
  const r = await j('POST', '/api/activities', { projectId: 'prj-p3', name: 'Persisted activity', duration: 3 }, body.token);
  assert.equal(r.status, 200);
  app.flush();
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'keel.json'), 'utf8'));
  assert.ok(saved.activities.some((a) => a.name === 'Persisted activity'));
  assert.ok(saved.audit.some((a) => a.entityId === r.body.id));
});
