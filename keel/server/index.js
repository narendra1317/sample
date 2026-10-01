#!/usr/bin/env node
// Keel server — zero external dependencies (Node 18+).
//   node server/index.js [--port 8080] [--data ./data/keel.json] [--reset-demo] [--seed-only]
// Environment: PORT, KEEL_DATA, KEEL_ADMIN_EMAIL, KEEL_ADMIN_PASSWORD, KEEL_SESSION_HOURS

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService, publicUser, emptyDb } from '../public/core/service.js';
import { buildDemoDb, DEMO_PASSWORD } from '../public/core/seed.js';
import { hashPassword, verifyPassword, SessionStore, LoginLimiter } from './auth.js';
import { JsonStore } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const PORT = Number(arg('--port', process.env.PORT || 8080));
const DATA_FILE = path.resolve(arg('--data', process.env.KEEL_DATA || path.join(ROOT, 'data', 'keel.json')));
const SESSION_HOURS = Number(process.env.KEEL_SESSION_HOURS || 12);

export function openStore({ dataFile = DATA_FILE, resetDemo = args.includes('--reset-demo'), log = console.log } = {}) {
  const store = new JsonStore(dataFile);
  if (resetDemo || !store.exists()) {
    const blank = args.includes('--blank') || process.env.KEEL_BLANK === '1';
    let db;
    if (blank) {
      db = emptyDb();
      const email = process.env.KEEL_ADMIN_EMAIL || 'admin@example.com';
      const pw = process.env.KEEL_ADMIN_PASSWORD;
      if (!pw || pw.length < 8) throw new Error('Set KEEL_ADMIN_PASSWORD (8+ chars) to initialise a blank workspace');
      db.users.push({ id: 'usr-admin', name: 'Administrator', email, role: 'admin', resourceId: null, ...hashPassword(pw) });
      db.calendars.push({ id: 'default', name: 'Standard 5-day', workDays: [1, 2, 3, 4, 5], hoursPerDay: 8, holidays: [] });
      log(`Initialised blank workspace. Sign in as ${email}.`);
    } else {
      db = buildDemoDb({ hashPassword });
      log(`Loaded demo portfolio. Sign in as pm@demo.keel / ${DEMO_PASSWORD} (see README for other roles).`);
    }
    store.write(db);
  }
  return store;
}

export function createApp({ store, sessionHours = SESSION_HOURS, log = console.log }) {
  const db = store.read();
  const service = createService({ db, hashPassword, onChange: (d) => store.scheduleWrite(d) });
  const sessions = new SessionStore(sessionHours);
  const limiter = new LoginLimiter();

  const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json',
  };

  const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
  };

  function send(res, status, body, headers = {}) {
    const json = typeof body === 'string' ? body : JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...securityHeaders, ...headers });
    res.end(json);
  }

  function readBody(req, limit = 25 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > limit) {
          reject(Object.assign(new Error('Request too large'), { status: 413 }));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (!raw) return resolve({});
        try {
          resolve(JSON.parse(raw));
        } catch {
          reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
        }
      });
      req.on('error', reject);
    });
  }

  function serveStatic(req, res, pathname) {
    let rel = decodeURIComponent(pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, { error: 'Forbidden' });
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) {
        // SPA fallback
        if (!path.extname(rel)) return serveStatic(req, res, '/index.html');
        return send(res, 404, { error: 'Not found' });
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': rel === '/index.html' ? 'no-cache' : 'public, max-age=300',
        ...securityHeaders,
      });
      fs.createReadStream(file).pipe(res);
    });
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;
    try {
      if (!pathname.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' });
        return serveStatic(req, res, pathname);
      }
      if (pathname === '/api/health') return send(res, 200, { ok: true, version: '1.0.0', time: new Date().toISOString() });

      if (pathname === '/api/login' && req.method === 'POST') {
        const ip = req.socket.remoteAddress || 'unknown';
        if (!limiter.allow(ip)) return send(res, 429, { error: 'Too many sign-in attempts. Try again in a few minutes.' });
        const { email, password } = await readBody(req);
        const user = db.users.find((u) => u.email.toLowerCase() === String(email || '').toLowerCase());
        if (!user || !verifyPassword(String(password || ''), user)) {
          limiter.fail(ip);
          return send(res, 401, { error: 'Email or password is incorrect' });
        }
        limiter.reset(ip);
        const token = sessions.create(user.id);
        service.audit(user, 'login', 'users', user.id, 'signed in');
        store.scheduleWrite(db);
        return send(res, 200, { token, user: publicUser(user), expiresInHours: sessionHours });
      }

      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
      const userId = token ? sessions.get(token) : null;
      const user = userId ? db.users.find((u) => u.id === userId) : null;
      if (!user) return send(res, 401, { error: 'Not signed in' });

      if (pathname === '/api/logout' && req.method === 'POST') {
        sessions.destroy(token);
        return send(res, 200, { ok: true });
      }
      if (pathname === '/api/backup' && req.method === 'GET') {
        if (user.role !== 'admin') return send(res, 403, { error: 'Administrators only' });
        return send(res, 200, JSON.stringify(db), { 'Content-Disposition': `attachment; filename="keel-backup-${new Date().toISOString().slice(0, 10)}.json"` });
      }

      const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
      const query = Object.fromEntries(url.searchParams);
      const out = service.handle(user, req.method, pathname, body, query);
      if (out.status >= 500) log('API error', req.method, pathname, out.body.error);
      return send(res, out.status, out.body);
    } catch (e) {
      log('Request failed', req.method, pathname, e.message);
      return send(res, e.status || 500, { error: e.status ? e.message : 'Internal error' });
    }
  }

  const server = http.createServer((req, res) => {
    handle(req, res);
  });
  return { server, service, sessions, flush: () => store.flush(db) };
}

// ---- CLI entry ---------------------------------------------------------------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const store = openStore();
  if (args.includes('--seed-only')) {
    console.log(`Data written to ${DATA_FILE}`);
    process.exit(0);
  }
  const app = createApp({ store });
  app.server.listen(PORT, () => {
    console.log(`\n  Keel project controls running at http://localhost:${PORT}\n  Data file: ${DATA_FILE}\n`);
  });
  const shutdown = () => {
    app.flush();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
