// Durable JSON document store with atomic writes and rolling backups.
// Good for a single-company deployment of up to a few hundred projects; the
// service layer is storage-agnostic so a PostgreSQL adapter can replace this
// without touching business logic (see docs/ARCHITECTURE.md).

import fs from 'node:fs';
import path from 'node:path';
import { ensureDb } from '../public/core/service.js';

export class JsonStore {
  constructor(file, { debounceMs = 250, keepBackups = 10 } = {}) {
    this.file = file;
    this.debounceMs = debounceMs;
    this.keepBackups = keepBackups;
    this.timer = null;
    this.lastBackupDay = null;
  }
  exists() {
    return fs.existsSync(this.file);
  }
  read() {
    return ensureDb(JSON.parse(fs.readFileSync(this.file, 'utf8')));
  }
  write(db) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, this.file);
    this.backup();
  }
  scheduleWrite(db) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.write(db), this.debounceMs);
  }
  flush(db) {
    clearTimeout(this.timer);
    this.write(db);
  }
  backup() {
    const day = new Date().toISOString().slice(0, 10);
    if (day === this.lastBackupDay) return;
    this.lastBackupDay = day;
    const dir = path.join(path.dirname(this.file), 'backups');
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(this.file, path.join(dir, `${path.basename(this.file, '.json')}-${day}.json`));
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
    for (const f of files.slice(0, Math.max(0, files.length - this.keepBackups))) fs.unlinkSync(path.join(dir, f));
  }
}
