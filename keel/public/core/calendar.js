// Working-time calendars.
//
// The engine reasons about *time points*: point p is the start of day p.
// An activity that works days s..f (inclusive) occupies [s, f + 1).
// Every calendar keeps a lazily-extended cumulative index of working days so
// that "add N working days" and "count working days between" are O(1).

import { toDay, dow } from './dates.js';

const BASE = toDay('1990-01-01');
const CHUNK = 366 * 5;

export class WorkCalendar {
  constructor({ id = 'default', name = 'Standard 5-day', workDays = [1, 2, 3, 4, 5], hoursPerDay = 8, holidays = [] } = {}) {
    this.id = id;
    this.name = name;
    this.hoursPerDay = hoursPerDay;
    this.workDays = new Set(workDays);
    if (this.workDays.size === 0) throw new Error(`Calendar "${name}" has no working days`);
    this.holidays = new Set(holidays.map(toDay));
    this.cum = [0]; // cum[i] = working days in [BASE, BASE + i)
    this.byIndex = []; // byIndex[k] = day number of the k-th working day
    this.extendTo(toDay('2040-01-01'));
  }

  isWork(day) {
    return this.workDays.has(dow(day)) && !this.holidays.has(day);
  }

  extendTo(day) {
    const need = day - BASE + 1;
    while (this.cum.length <= need) {
      const start = this.cum.length - 1;
      const end = start + CHUNK;
      for (let i = start; i < end; i++) {
        const d = BASE + i;
        const w = this.isWork(d);
        if (w) this.byIndex.push(d);
        this.cum.push(this.cum[i] + (w ? 1 : 0));
      }
    }
  }

  /** Number of working days strictly before point p (since the calendar base). */
  index(p) {
    if (p < BASE) throw new Error('Date is before 1990 and outside the supported range');
    if (p - BASE >= this.cum.length - 1) this.extendTo(p + 400);
    return this.cum[p - BASE];
  }

  /** Day number of the k-th working day. */
  dayAt(k) {
    if (k < 0) throw new Error('Date is before 1990 and outside the supported range');
    while (k >= this.byIndex.length) this.extendTo(BASE + this.cum.length + CHUNK);
    return this.byIndex[k];
  }

  /** First working day on or after point p — where work can actually begin. */
  nextWork(p) {
    return this.dayAt(this.index(p));
  }

  /** Move a point by n working days (n may be negative). Used for lags. */
  shift(p, n) {
    if (!n) return p;
    return this.dayAt(this.index(p) + n);
  }

  /** End point of work that starts at point s and lasts n working days. */
  finishFrom(s, n) {
    if (n <= 0) return s;
    return this.dayAt(this.index(s) + n - 1) + 1;
  }

  /** Latest start point for work of n days that must end by point e. */
  startFrom(e, n) {
    if (n <= 0) return e;
    return this.dayAt(this.index(e) - n);
  }

  /** Normalise an end point onto the working grid (end of the last working day before e). */
  prevEnd(e) {
    const k = this.index(e);
    return k === 0 ? e : this.dayAt(k - 1) + 1;
  }

  /** Working days between two points (b - a), negative if b is before a. */
  between(a, b) {
    return this.index(b) - this.index(a);
  }
}

export function buildCalendars(list = []) {
  const map = new Map();
  for (const c of list) map.set(c.id, new WorkCalendar(c));
  if (!map.has('default')) map.set('default', new WorkCalendar());
  return map;
}
