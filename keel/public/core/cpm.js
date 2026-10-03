// Critical Path Method scheduling engine.
//
// Supports: FS/SS/FF/SF relationships with positive or negative lag, multiple
// calendars, P6-style constraints (SNET, SNLT, FNET, FNLT, MSO, MFO, ALAP),
// progress with a data date (retained logic or progress override),
// start/finish milestones, level-of-effort activities, loop detection,
// total & free float, driving relationships and the longest path.
//
// Conventions: see calendar.js. es/ef/ls/lf are time *points* (day numbers);
// es is start-of-day, ef is end-of-work (exclusive). Lags are counted in the
// successor's calendar.

import { toDay, fromDay } from './dates.js';
import { buildCalendars, WorkCalendar } from './calendar.js';

export const REL_TYPES = ['FS', 'SS', 'FF', 'SF'];
export const CONSTRAINTS = {
  '': 'None',
  SNET: 'Start On or After',
  SNLT: 'Start On or Before',
  FNET: 'Finish On or After',
  FNLT: 'Finish On or Before',
  MSO: 'Mandatory Start',
  MFO: 'Mandatory Finish',
  ALAP: 'As Late As Possible',
};
export const HARD_CONSTRAINTS = new Set(['MSO', 'MFO', 'SNLT', 'FNLT']);

export function activityStatus(a) {
  if (a.actualFinish) return 'complete';
  if (a.actualStart) return 'in-progress';
  return 'not-started';
}

export function isMilestone(a) {
  return a.type === 'start-milestone' || a.type === 'finish-milestone';
}

export function remainingDuration(a) {
  if (a.actualFinish) return 0;
  if (isMilestone(a)) return 0;
  if (a.actualStart) {
    if (a.remaining !== undefined && a.remaining !== null && a.remaining !== '') return Math.max(0, Number(a.remaining));
    return Math.max(0, Math.round(Number(a.duration || 0) * (1 - Number(a.pctComplete || 0) / 100)));
  }
  return Math.max(0, Math.round(Number(a.duration || 0)));
}

/** Smallest end point >= e that falls at the end of a working day. */
function endUp(cal, e) {
  return cal.isWork(e - 1) ? e : cal.nextWork(e) + 1;
}
/** Latest working-day start <= p. */
function startDown(cal, p) {
  const k = cal.index(p + 1) - 1;
  return k < 0 ? p : cal.dayAt(k);
}

/**
 * @param {object} input
 * @param {object} input.project  { startDate, dataDate, mustFinishBy, calendarId, progressMode }
 * @param {object[]} input.activities
 * @param {object[]} input.relationships { id, predId, succId, type, lag }
 * @param {object[]|Map} input.calendars
 * @param {object} [input.options] { durationOverride: Map, criticalFloat: number, extraRelationships }
 */
export function schedule({ project, activities, relationships = [], calendars = [], options = {} }) {
  const cals = calendars instanceof Map ? calendars : buildCalendars(calendars);
  const defaultCal = cals.get(project.calendarId) || cals.get('default') || new WorkCalendar();
  const calOf = (a) => cals.get(a.calendarId) || defaultCal;
  const criticalFloat = options.criticalFloat ?? 0;
  const override = options.durationOverride;
  const retained = (project.progressMode || 'retained') !== 'override';
  const warnings = [];

  const acts = new Map();
  for (const a of activities) acts.set(a.id, a);

  const rels = [...relationships, ...(options.extraRelationships || [])].filter((r) => {
    if (!acts.has(r.predId) || !acts.has(r.succId) || r.predId === r.succId) return false;
    return true;
  });
  const preds = new Map();
  const succs = new Map();
  for (const a of activities) {
    preds.set(a.id, []);
    succs.set(a.id, []);
  }
  for (const r of rels) {
    preds.get(r.succId).push(r);
    succs.get(r.predId).push(r);
  }

  // ---- topological order (Kahn), with loop detection --------------------
  const indeg = new Map();
  for (const a of activities) indeg.set(a.id, preds.get(a.id).length);
  const queue = activities.filter((a) => indeg.get(a.id) === 0).map((a) => a.id);
  const order = [];
  const ignored = new Set();
  let qi = 0;
  while (order.length < activities.length) {
    while (qi < queue.length) {
      const id = queue[qi++];
      order.push(id);
      for (const r of succs.get(id)) {
        if (ignored.has(r)) continue;
        const n = indeg.get(r.succId) - 1;
        indeg.set(r.succId, n);
        if (n === 0) queue.push(r.succId);
      }
    }
    if (order.length < activities.length) {
      // A loop exists. Break it at the lowest-ordered remaining activity.
      const placed = new Set(order);
      const stuck = activities.filter((a) => !placed.has(a.id));
      const victim = stuck[0];
      const loopRels = preds.get(victim.id).filter((r) => !placed.has(r.predId));
      for (const r of loopRels) ignored.add(r);
      warnings.push({
        code: 'LOOP',
        message: `Circular logic detected around ${victim.code || victim.name}; ${loopRels.length} relationship(s) ignored until fixed.`,
        activityIds: stuck.map((a) => a.id),
      });
      indeg.set(victim.id, 0);
      queue.push(victim.id);
    }
  }
  const live = (r) => !ignored.has(r);

  const projectStart = toDay(project.startDate) ?? toDay(project.dataDate);
  const dataPoint = toDay(project.dataDate) ?? projectStart;
  const floor = Math.max(projectStart, dataPoint);
  const res = new Map();

  const durOf = (a) => {
    if (isMilestone(a)) return 0;
    if (override && override.has(a.id)) {
      const planned = Number(a.duration || 0);
      const sampled = override.get(a.id);
      if (a.actualStart && planned > 0) return Math.max(0, Math.round((remainingDuration(a) * sampled) / planned));
      return Math.max(0, Math.round(sampled));
    }
    return remainingDuration(a);
  };

  // ---- forward pass ------------------------------------------------------
  for (const id of order) {
    const a = acts.get(id);
    const cal = calOf(a);
    const status = activityStatus(a);
    const dur = durOf(a);
    const r = { id, status, remaining: dur, driving: [] };
    res.set(id, r);

    if (status === 'complete') {
      const af = toDay(a.actualFinish);
      const as = toDay(a.actualStart) ?? af;
      if (a.type === 'finish-milestone') r.es = r.ef = af + 1;
      else if (a.type === 'start-milestone') r.es = r.ef = as;
      else {
        r.es = as;
        r.ef = af + 1;
      }
      continue;
    }

    let startReq = -Infinity;
    let finishReq = -Infinity;
    let startDrv = [];
    let finishDrv = [];
    for (const rel of preds.get(id)) {
      if (!live(rel)) continue;
      const p = res.get(rel.predId);
      const pa = acts.get(rel.predId);
      if (pa.type === 'loe') continue; // LOE never drives
      const lag = Number(rel.lag || 0);
      const type = rel.type || 'FS';
      if (type === 'FS' || type === 'SS') {
        const v = cal.shift(type === 'FS' ? p.ef : p.es, lag);
        if (v > startReq) {
          startReq = v;
          startDrv = [rel.id];
        } else if (v === startReq) startDrv.push(rel.id);
      } else {
        const v = cal.shift(type === 'FF' ? p.ef : p.es, lag);
        if (v > finishReq) {
          finishReq = v;
          finishDrv = [rel.id];
        } else if (v === finishReq) finishDrv.push(rel.id);
      }
    }

    const cType = a.constraintType || '';
    const cDay = toDay(a.constraintDate);

    if (status === 'in-progress') {
      r.es = toDay(a.actualStart);
      let remStart = dataPoint;
      if (retained && startReq > remStart) {
        remStart = startReq;
        r.driving = startDrv;
      }
      const resume = toDay(a.resume);
      if (resume !== null && resume > remStart) remStart = resume; // remaining work resumes no earlier than this (MS Project "Resume")
      remStart = cal.nextWork(Math.max(remStart, r.es));
      r.remStart = remStart;
      r.ef = cal.finishFrom(remStart, dur);
      if (retained && finishReq > r.ef) {
        r.ef = endUp(cal, finishReq);
        r.driving = finishDrv;
      }
      if (dur === 0 && r.ef < dataPoint) r.ef = dataPoint;
      continue;
    }

    // not started
    let es = floor;
    let drv = [];
    if (startReq > es) {
      es = startReq;
      drv = startDrv;
    }
    if (cDay !== null) {
      if ((cType === 'SNET') && cDay > es) {
        es = cDay;
        drv = ['constraint'];
      }
      if (cType === 'MSO') {
        es = cDay;
        drv = ['constraint'];
      }
    }

    if (a.type === 'finish-milestone') {
      let p = Math.max(es, finishReq);
      if (finishReq > es) drv = finishDrv;
      if (cDay !== null && cType === 'FNET' && cDay + 1 > p) {
        p = cDay + 1;
        drv = ['constraint'];
      }
      if (cDay !== null && cType === 'MFO') {
        p = cDay + 1;
        drv = ['constraint'];
      }
      r.es = r.ef = p;
    } else if (a.type === 'start-milestone') {
      let p = cal.nextWork(Math.max(es, finishReq));
      if (finishReq > es) drv = finishDrv;
      r.es = r.ef = p;
    } else {
      es = cal.nextWork(es);
      let ef = cal.finishFrom(es, dur);
      let fr = finishReq;
      if (cDay !== null && cType === 'FNET' && cDay + 1 > fr) fr = cDay + 1;
      if (fr > ef) {
        ef = endUp(cal, fr);
        es = cal.startFrom(ef, dur);
        drv = finishReq > -Infinity && finishReq >= fr ? finishDrv : ['constraint'];
      }
      if (cDay !== null && cType === 'MFO') {
        ef = endUp(cal, cDay + 1);
        es = cal.startFrom(ef, dur);
        drv = ['constraint'];
      }
      r.es = es;
      r.ef = ef;
    }
    r.driving = drv;
  }

  // ---- level of effort: stretch to successors -----------------------------
  for (const id of order) {
    const a = acts.get(id);
    if (a.type !== 'loe' || res.get(id).status === 'complete') continue;
    const r = res.get(id);
    const cal = calOf(a);
    let end = r.ef;
    for (const rel of succs.get(id)) {
      const s = res.get(rel.succId);
      const t = rel.type || 'FS';
      const lag = Number(rel.lag || 0);
      if (t === 'FF') end = Math.max(end, cal.shift(s.ef, -lag));
      else if (t === 'SF') end = Math.max(end, cal.shift(s.es, -lag));
      else if (t === 'FS' || t === 'SS') end = Math.max(end, cal.shift(s.es, -lag));
    }
    r.ef = end;
    r.remaining = Math.max(0, cal.between(r.remStart ?? r.es, r.ef));
  }

  // ---- project finish ----------------------------------------------------
  let finishPoint = -Infinity;
  for (const r of res.values()) if (r.ef > finishPoint) finishPoint = r.ef;
  if (finishPoint === -Infinity) finishPoint = projectStart;
  const mustFinish = toDay(project.mustFinishBy);
  const lateTarget = mustFinish !== null ? mustFinish + 1 : finishPoint;

  // ---- backward pass -----------------------------------------------------
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const a = acts.get(id);
    const r = res.get(id);
    const cal = calOf(a);
    if (r.status === 'complete' || a.type === 'loe') {
      r.ls = r.es;
      r.lf = r.ef;
      continue;
    }
    const dur = r.remaining;
    let lf = Infinity;
    let hasSucc = false;
    for (const rel of succs.get(id)) {
      if (!live(rel)) continue;
      const s = res.get(rel.succId);
      const sa = acts.get(rel.succId);
      if (s.status === 'complete' || sa.type === 'loe') continue;
      hasSucc = true;
      const lag = Number(rel.lag || 0);
      const t = rel.type || 'FS';
      let v;
      if (t === 'FS') v = cal.shift(s.ls, -lag);
      else if (t === 'FF') v = cal.shift(s.lf, -lag);
      else {
        const lsReq = cal.shift(t === 'SS' ? s.ls : s.lf, -lag);
        v = isMilestone(a) ? lsReq : cal.finishFrom(startDown(cal, lsReq), dur);
        if (r.status === 'in-progress') v = Infinity; // already started; start-side logic satisfied
      }
      if (v < lf) lf = v;
    }
    // No successors, or only start-side links on work that has already started
    // (those are satisfied): the late finish falls back to the project target.
    if (!hasSucc || lf === Infinity) lf = lateTarget;

    const cType = a.constraintType || '';
    const cDay = toDay(a.constraintDate);
    if (cDay !== null && r.status === 'not-started') {
      if (cType === 'FNLT' || cType === 'MFO') lf = Math.min(lf, cDay + 1);
      if (cType === 'SNLT' || cType === 'MSO') {
        lf = Math.min(lf, isMilestone(a) ? cDay : cal.finishFrom(cal.nextWork(cDay), dur));
      }
    }

    if (a.type === 'start-milestone') {
      r.ls = r.lf = startDown(cal, lf);
    } else if (a.type === 'finish-milestone') {
      r.ls = r.lf = lf;
    } else {
      r.lf = cal.prevEnd(lf);
      r.ls = cal.startFrom(r.lf, dur);
    }
  }

  // ---- floats, criticality, ALAP -----------------------------------------
  for (const id of order) {
    const a = acts.get(id);
    const r = res.get(id);
    const cal = calOf(a);
    if (r.status === 'complete' || a.type === 'loe') {
      r.tf = null;
      r.ff = null;
      r.critical = false;
      continue;
    }
    r.tf = cal.between(r.ef, r.lf);
    let ff = Infinity;
    let any = false;
    for (const rel of succs.get(id)) {
      if (!live(rel)) continue;
      const s = res.get(rel.succId);
      if (s.status === 'complete' || acts.get(rel.succId).type === 'loe') continue;
      any = true;
      const lag = Number(rel.lag || 0);
      const t = rel.type || 'FS';
      const from = cal.shift(t === 'FS' || t === 'FF' ? r.ef : r.es, lag);
      const to = t === 'FS' || t === 'SS' ? s.es : s.ef;
      ff = Math.min(ff, cal.between(from, to));
    }
    if (!any) ff = cal.between(r.ef, lateTarget);
    r.ff = Math.max(0, Math.min(ff, r.tf));
    if (r.tf < 0) r.ff = 0;
    r.critical = r.tf <= criticalFloat;
    if (a.constraintType === 'ALAP' && r.status === 'not-started') {
      r.es = r.ls;
      r.ef = r.lf;
      r.ff = 0;
    }
  }

  // ---- longest path (driving chain back from the latest finish) ----------
  const longest = new Set();
  const stack = [...res.values()].filter((r) => r.ef === finishPoint && acts.get(r.id).type !== 'loe').map((r) => r.id);
  const relById = new Map(rels.map((r) => [r.id, r]));
  while (stack.length) {
    const id = stack.pop();
    if (longest.has(id)) continue;
    const r = res.get(id);
    if (r.status === 'complete') continue;
    longest.add(id);
    for (const d of r.driving) {
      const rel = relById.get(d);
      if (rel) stack.push(rel.predId);
    }
  }

  // ---- presentation fields ------------------------------------------------
  for (const [id, r] of res) {
    const a = acts.get(id);
    const fin = (p) => (a.type === 'start-milestone' ? fromDay(p) : fromDay(p - 1));
    const st = (p) => (a.type === 'finish-milestone' ? fromDay(p - 1) : fromDay(p));
    r.start = st(r.es);
    r.finish = r.ef > r.es || a.type === 'finish-milestone' ? fin(r.ef) : r.start;
    r.lateStart = st(r.ls);
    r.lateFinish = r.lf > r.ls || a.type === 'finish-milestone' ? fin(r.lf) : r.lateStart;
    r.longest = longest.has(id);
  }

  return {
    byId: res,
    order,
    warnings,
    projectStart: fromDay(projectStart),
    dataDate: fromDay(dataPoint),
    finishPoint,
    projectFinish: fromDay(finishPoint - 1),
    mustFinishBy: project.mustFinishBy || null,
    criticalIds: [...res.values()].filter((r) => r.critical).map((r) => r.id),
    longestPathIds: [...longest],
  };
}

/** Roll schedule results up a WBS tree. Returns Map wbsId -> summary. */
export function rollupWbs(wbs, activities, sched, weightOf = (a) => Number(a.duration || 0) || 1) {
  const out = new Map();
  const parentOf = new Map();
  for (const w of wbs) {
    out.set(w.id, { id: w.id, es: Infinity, ef: -Infinity, weight: 0, earned: 0, count: 0, critical: false, minTf: Infinity });
    parentOf.set(w.id, w.parentId || null);
  }
  const bump = (wid, a, r) => {
    let cur = wid;
    const seen = new Set();
    while (cur && out.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      const s = out.get(cur);
      s.es = Math.min(s.es, r.es);
      s.ef = Math.max(s.ef, r.ef);
      const w = weightOf(a);
      s.weight += w;
      s.earned += (w * Number(a.pctComplete || 0)) / 100;
      s.count++;
      if (r.critical) s.critical = true;
      if (r.tf !== null && r.tf < s.minTf) s.minTf = r.tf;
      cur = parentOf.get(cur);
    }
  };
  for (const a of activities) {
    const r = sched.byId.get(a.id);
    if (r && a.wbsId) bump(a.wbsId, a, r);
  }
  for (const s of out.values()) {
    s.pct = s.weight ? (100 * s.earned) / s.weight : 0;
    s.start = s.es === Infinity ? null : fromDay(s.es);
    s.finish = s.ef === -Infinity ? null : fromDay(s.ef - 1);
    if (s.minTf === Infinity) s.minTf = null;
  }
  return out;
}
