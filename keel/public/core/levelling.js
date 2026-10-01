// Resource levelling: serial, priority-based heuristic (the same family of
// algorithm P6 uses). Activities are placed in priority order at the first
// date where logic is satisfied AND every assigned resource stays within its
// daily limit — optionally counting load already committed on *other*
// projects, which neither P6 nor MS Project does out of the box.

import { fromDay } from './dates.js';
import { activityStatus, isMilestone } from './cpm.js';
import { groupBy, indexBy } from './evm.js';

const MAX_SEARCH = 3 * 365;

export function level({ project, activities, relationships, assignments, resources, sched, calOf, externalLoad = [], priority = 'float' }) {
  const acts = indexBy(activities);
  const resById = indexBy(resources);
  const byAct = groupBy(assignments, 'activityId');
  const preds = groupBy(relationships.filter((r) => acts.has(r.predId) && acts.has(r.succId)), 'succId');

  // usage[resourceId] = Map(day -> hours)
  const usage = new Map();
  const use = (rid) => {
    if (!usage.has(rid)) usage.set(rid, new Map());
    return usage.get(rid);
  };
  for (const e of externalLoad) use(e.resourceId).set(e.day, (use(e.resourceId).get(e.day) || 0) + e.hours);

  const limitOf = (rid) => {
    const r = resById.get(rid);
    if (!r || r.type === 'material') return Infinity;
    const lim = Number(r.maxHoursPerDay || 0);
    return lim > 0 ? lim : Infinity;
  };

  const out = new Map();
  const placed = new Set();
  const remainingPreds = new Map(activities.map((a) => [a.id, (preds.get(a.id) || []).length]));
  const succsOf = groupBy(relationships.filter((r) => acts.has(r.predId) && acts.has(r.succId)), 'predId');

  const rateOf = (a, r, dur) => (byAct.get(a.id) || []).map((as) => ({ rid: as.resourceId, perDay: dur ? Number(as.budgetHours || 0) / dur : 0 }));

  const blockers = new Map(); // resourceId -> days of delay it caused
  const fits = (cal, s, dur, loads) => {
    let d = s;
    let n = 0;
    while (n < dur) {
      if (cal.isWork(d)) {
        for (const l of loads) {
          const cur = use(l.rid).get(d) || 0;
          if (cur > 0 && cur + l.perDay > limitOf(l.rid) + 1e-9) return l.rid;
        }
        n++;
      }
      d++;
    }
    return null;
  };
  const book = (cal, s, dur, loads) => {
    let d = s;
    let n = 0;
    while (n < dur) {
      if (cal.isWork(d)) {
        for (const l of loads) use(l.rid).set(d, (use(l.rid).get(d) || 0) + l.perDay);
        n++;
      }
      d++;
    }
  };

  const key = (id) => {
    const r = sched.byId.get(id);
    const a = acts.get(id);
    const p = priority === 'float' ? r.tf ?? 0 : Number(a.priority || 0);
    return [r.es, p, a.code || ''];
  };
  const cmp = (x, y) => {
    const a = key(x);
    const b = key(y);
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    return 0;
  };

  const ready = activities.filter((a) => remainingPreds.get(a.id) === 0).map((a) => a.id);
  let delayed = 0;
  while (ready.length) {
    ready.sort(cmp);
    const id = ready.shift();
    const a = acts.get(id);
    const r = sched.byId.get(id);
    const cal = calOf(a);
    const status = activityStatus(a);
    const dur = r.remaining;
    let es;
    let ef;
    if (status !== 'not-started' || a.type === 'loe' || a.constraintType === 'MSO' || a.constraintType === 'MFO') {
      es = r.es;
      ef = r.ef;
      const from = status === 'in-progress' ? r.remStart ?? r.es : r.es;
      if (status !== 'complete' && !isMilestone(a) && a.type !== 'loe') book(cal, from, dur, rateOf(a, r, dur));
    } else {
      // earliest start honouring levelled predecessors
      let s = r.es;
      for (const rel of preds.get(id) || []) {
        const p = out.get(rel.predId);
        if (!p) continue;
        const lag = Number(rel.lag || 0);
        const t = rel.type || 'FS';
        if (t === 'FS') s = Math.max(s, cal.shift(p.ef, lag));
        else if (t === 'SS') s = Math.max(s, cal.shift(p.es, lag));
        else if (t === 'FF') s = Math.max(s, cal.startFrom(cal.shift(p.ef, lag), dur));
        else s = Math.max(s, cal.startFrom(cal.shift(p.es, lag), dur));
      }
      if (a.type !== 'finish-milestone') s = cal.nextWork(s);
      const loads = isMilestone(a) ? [] : rateOf(a, r, dur);
      let tries = 0;
      let blocker = loads.length ? fits(cal, s, dur, loads) : null;
      while (blocker && tries < MAX_SEARCH) {
        blockers.set(blocker, (blockers.get(blocker) || 0) + 1);
        s = cal.nextWork(s + 1);
        tries++;
        blocker = fits(cal, s, dur, loads);
      }
      es = s;
      ef = cal.finishFrom(s, dur);
      book(cal, s, dur, loads);
    }
    const delay = cal.between(r.es, es);
    if (delay > 0) delayed++;
    const shown = a.type === 'finish-milestone' ? fromDay(ef - 1) : null;
    out.set(id, { id, es, ef, start: shown || fromDay(es), finish: shown || fromDay(Math.max(es, ef - 1)), delay });
    placed.add(id);
    for (const rel of succsOf.get(id) || []) {
      const n = remainingPreds.get(rel.succId) - 1;
      remainingPreds.set(rel.succId, n);
      if (n === 0) ready.push(rel.succId);
    }
  }
  // anything left (logic loops) keeps its CPM dates
  for (const a of activities) {
    if (!out.has(a.id)) {
      const r = sched.byId.get(a.id);
      out.set(a.id, { id: a.id, es: r.es, ef: r.ef, start: r.start, finish: r.finish, delay: 0 });
    }
  }
  let finish = -Infinity;
  for (const v of out.values()) finish = Math.max(finish, v.ef);
  const bottlenecks = [...blockers.entries()].sort((a, b) => b[1] - a[1]).map(([resourceId, days]) => ({ resourceId, days, limit: limitOf(resourceId) }));
  return { byId: out, delayedCount: delayed, finish: fromDay(finish - 1), finishPoint: finish, usage, bottlenecks };
}
