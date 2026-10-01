// Earned Value Management (ANSI/EIA-748 style metrics) plus Earned Schedule.
//
// Budgets come from resource assignments (hours x rate) plus any non-labour
// budget on the activity. Actual cost comes from *approved* timesheet hours
// (x rate) plus actual non-labour cost recorded against the activity.

import { toDay, fromDay, weekStartDay } from './dates.js';
import { isMilestone } from './cpm.js';

export const PROGRESS_METHODS = {
  physical: 'Physical % (manual)',
  duration: 'Duration %',
  steps: 'Weighted steps (rules of credit)',
  units: 'Units % (hours burned)',
  register: 'Linked MDR / PO register',
};

export function stepsPercent(a) {
  const steps = a.steps || [];
  const total = steps.reduce((s, x) => s + Number(x.weight || 0), 0);
  if (!total) return 0;
  const done = steps.reduce((s, x) => s + (x.done ? Number(x.weight || 0) : Number(x.weight || 0) * (Number(x.pct || 0) / 100)), 0);
  return (100 * done) / total;
}

/** Percent complete used for earned value, honouring the activity's progress method. */
export function percentComplete(a, ctx = {}) {
  if (a.actualFinish) return 100;
  if (!a.actualStart) return 0;
  switch (a.progressMethod) {
    case 'duration': {
      const d = Number(a.duration || 0);
      const rem = a.remaining !== undefined && a.remaining !== null && a.remaining !== '' ? Number(a.remaining) : d * (1 - Number(a.pctComplete || 0) / 100);
      return d ? Math.max(0, Math.min(100, (100 * (d - rem)) / d)) : 0;
    }
    case 'steps':
      return stepsPercent(a);
    case 'register':
      return ctx.registerPct?.has(a.id) ? ctx.registerPct.get(a.id) : Number(a.pctComplete || 0);
    case 'units': {
      const b = ctx.budgetHours?.get(a.id) || 0;
      const act = ctx.actualHours?.get(a.id) || 0;
      return b ? Math.min(100, (100 * act) / b) : Number(a.pctComplete || 0);
    }
    default:
      return Math.max(0, Math.min(100, Number(a.pctComplete || 0)));
  }
}

export function indexBy(list, key = 'id') {
  const m = new Map();
  for (const x of list) m.set(x[key], x);
  return m;
}

export function groupBy(list, key) {
  const m = new Map();
  for (const x of list) {
    const k = typeof key === 'function' ? key(x) : x[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

/** Budget per activity: { hours, labour, other, total }. */
export function activityBudgets(activities, assignments, resources) {
  const resById = indexBy(resources);
  const byAct = groupBy(assignments, 'activityId');
  const out = new Map();
  for (const a of activities) {
    let hours = 0;
    let labour = 0;
    for (const as of byAct.get(a.id) || []) {
      const h = Number(as.budgetHours || 0);
      const rate = Number(as.rate ?? resById.get(as.resourceId)?.rate ?? 0);
      hours += h;
      labour += h * rate;
    }
    const other = Number(a.budgetCost || 0);
    out.set(a.id, { hours, labour, other, total: labour + other });
  }
  return out;
}

/** Flatten approved timesheet lines into dated entries. */
export function timesheetEntries(timesheets, { statuses = ['approved'] } = {}) {
  const out = [];
  for (const ts of timesheets) {
    if (!statuses.includes(ts.status)) continue;
    const ws = toDay(ts.weekStart);
    for (const line of ts.lines || []) {
      (line.hours || []).forEach((h, i) => {
        const hours = Number(h || 0);
        if (hours > 0) {
          out.push({
            resourceId: ts.resourceId,
            projectId: line.projectId,
            activityId: line.activityId,
            day: ws + i,
            hours,
            status: ts.status,
            timesheetId: ts.id,
          });
        }
      });
    }
  }
  return out;
}

/** Evenly distribute an amount across the working days of [startIso, finishIso]. */
export function spreadDaily(startIso, finishIso, amount, cal) {
  const out = [];
  if (!amount || !startIso || !finishIso) return out;
  let s = toDay(startIso);
  const f = toDay(finishIso);
  if (f < s) return [[s, amount]];
  const days = [];
  for (let d = s; d <= f; d++) if (cal.isWork(d)) days.push(d);
  if (!days.length) return [[s, amount]];
  const each = amount / days.length;
  for (const d of days) out.push([d, each]);
  return out;
}

function fractionElapsed(startIso, finishIso, day, cal) {
  if (!startIso || !finishIso) return 0;
  const s = toDay(startIso);
  const f = toDay(finishIso) + 1;
  if (day >= f) return 1;
  if (day <= s) return 0;
  const total = cal.between(s, f);
  if (total <= 0) return day >= s ? 1 : 0;
  return Math.max(0, Math.min(1, cal.between(s, day) / total));
}

/**
 * Compute EVM metrics and weekly S-curve series.
 * @returns {{bac, pv, ev, ac, sv, cv, spi, cpi, eac, etc, vac, tcpi, spiT, es, series}}
 */
export function earnedValue({ project, activities, assignments, resources, timesheets = [], baseline, sched, calendar, actualCostEntries, registerPct }) {
  const budgets = activityBudgets(activities, assignments, resources);
  const resById = indexBy(resources);
  const dataDay = toDay(project.dataDate);
  const entries = actualCostEntries || timesheetEntries(timesheets).filter((e) => e.projectId === project.id);

  const actualHours = new Map();
  const actualCostByAct = new Map();
  const acByWeek = new Map();
  for (const e of entries) {
    const rate = Number(resById.get(e.resourceId)?.rate || 0);
    actualHours.set(e.activityId, (actualHours.get(e.activityId) || 0) + e.hours);
    actualCostByAct.set(e.activityId, (actualCostByAct.get(e.activityId) || 0) + e.hours * rate);
    const wk = weekStartDay(e.day);
    acByWeek.set(wk, (acByWeek.get(wk) || 0) + e.hours * rate);
  }
  // Non-labour actual cost (materials, subcontract, vendor invoices) is spread
  // across each activity's actual dates so the AC curve stays honest.
  for (const a of activities) {
    const oc = Number(a.actualCost || 0);
    if (!oc || !a.actualStart) continue;
    const endIso = a.actualFinish || fromDay(Math.max(toDay(a.actualStart), dataDay - 1));
    for (const [d, v] of spreadDaily(a.actualStart, endIso, oc, calendar)) {
      const wk = weekStartDay(d);
      acByWeek.set(wk, (acByWeek.get(wk) || 0) + v);
    }
  }
  const budgetHours = new Map([...budgets].map(([k, v]) => [k, v.hours]));
  const ctx = { budgetHours, actualHours, registerPct };

  const bl = baseline?.activities || {};
  const blBudget = (a) => (bl[a.id]?.budget !== undefined ? bl[a.id].budget : budgets.get(a.id).total);
  const blStart = (a) => bl[a.id]?.start || sched?.byId.get(a.id)?.start;
  const blFinish = (a) => bl[a.id]?.finish || sched?.byId.get(a.id)?.finish;

  let bac = 0;
  let ev = 0;
  let pv = 0;
  let ac = 0;
  const pctById = new Map();
  for (const a of activities) {
    if (a.type === 'loe' && !budgets.get(a.id).total) continue;
    const b = blBudget(a);
    bac += b;
    // Level-of-effort earns with the passage of time (EV = PV by definition).
    const r = sched?.byId.get(a.id);
    const pct = a.type === 'loe' && r ? 100 * fractionElapsed(r.start, r.finish, dataDay, calendar) : percentComplete(a, ctx);
    pctById.set(a.id, pct);
    ev += (b * pct) / 100;
    pv += b * fractionElapsed(blStart(a), blFinish(a), dataDay, calendar);
    ac += (actualCostByAct.get(a.id) || 0) + Number(a.actualCost || 0);
  }

  const spi = pv ? ev / pv : null;
  const cpi = ac ? ev / ac : null;
  const eac = cpi ? ac + (bac - ev) / cpi : bac;
  const etc = eac - ac;
  const vac = bac - eac;
  const tcpi = bac - ac ? (bac - ev) / (bac - ac) : null;

  // ---- weekly series -------------------------------------------------------
  const starts = activities.map((a) => toDay(blStart(a))).filter((x) => x !== null);
  const finishes = activities.map((a) => toDay(blFinish(a))).filter((x) => x !== null);
  const fcFinish = sched ? toDay(sched.projectFinish) : null;
  const first = weekStartDay(Math.min(toDay(project.startDate) ?? Infinity, ...starts));
  const last = weekStartDay(Math.max(...finishes, fcFinish ?? -Infinity, dataDay)) + 7;
  const series = [];
  if (Number.isFinite(first) && Number.isFinite(last) && last - first < 7 * 520) {
    let cumAc = 0;
    let cumFc = null;
    for (let w = first; w <= last; w += 7) {
      const end = w + 7; // cumulative to end of week
      let pvW = 0;
      let evW = 0;
      for (const a of activities) {
        const b = blBudget(a);
        if (!b) continue;
        pvW += b * fractionElapsed(blStart(a), blFinish(a), end, calendar);
        if (end <= dataDay + 7) evW += (b * historicalPct(a, pctById.get(a.id) || 0, Math.min(end, dataDay), dataDay)) / 100;
      }
      cumAc += acByWeek.get(w) || 0;
      const point = { week: fromDay(w), pv: pvW };
      if (w <= dataDay) {
        point.ev = evW;
        point.ac = cumAc;
      }
      if (sched && w + 7 > dataDay) {
        // forecast: actuals to date plus remaining budget spread on forecast dates
        if (cumFc === null) cumFc = ac;
        let add = 0;
        for (const a of activities) {
          const r = sched.byId.get(a.id);
          if (!r || r.status === 'complete') continue;
          const b = blBudget(a);
          const remaining = cpi ? (b * (1 - (pctById.get(a.id) || 0) / 100)) / Math.max(0.5, cpi) : b * (1 - (pctById.get(a.id) || 0) / 100);
          const s = Math.max(toDay(r.start), dataDay);
          const f = toDay(r.finish);
          add += remaining * (fractionElapsed(fromDay(s), fromDay(f), end, calendar) - fractionElapsed(fromDay(s), fromDay(f), w, calendar));
        }
        cumFc += add;
        point.forecast = cumFc;
      }
      series.push(point);
    }
  }

  // ---- earned schedule -----------------------------------------------------
  let es = null;
  let spiT = null;
  if (series.length && ev > 0) {
    let prev = { t: toDay(series[0].week), pv: 0 };
    for (const pt of series) {
      const t = toDay(pt.week) + 7;
      if (pt.pv >= ev) {
        const frac = pt.pv - prev.pv ? (ev - prev.pv) / (pt.pv - prev.pv) : 0;
        es = prev.t + frac * (t - prev.t);
        break;
      }
      prev = { t, pv: pt.pv };
    }
    if (es === null) es = prev.t;
    const start = toDay(series[0].week);
    const at = dataDay - start;
    spiT = at > 0 ? (es - start) / at : null;
  }

  return {
    bac,
    pv,
    ev,
    ac,
    sv: ev - pv,
    cv: ev - ac,
    spi,
    cpi,
    eac,
    etc,
    vac,
    tcpi,
    spiT,
    earnedScheduleDate: es !== null ? fromDay(Math.round(es)) : null,
    percentComplete: bac ? (100 * ev) / bac : 0,
    percentSpent: bac ? (100 * ac) / bac : 0,
    budgets,
    pctById,
    actualHours,
    series,
  };
}

/** Approximate % complete at a past point in time from actual dates. */
export function historicalPct(a, pctNow, day, dataDay) {
  if (!a.actualStart) return 0;
  const s = toDay(a.actualStart);
  if (day <= s) return 0;
  if (a.actualFinish) {
    const f = toDay(a.actualFinish) + 1;
    if (day >= f) return 100;
    if (isMilestone(a)) return day >= s ? 100 : 0;
    return (100 * (day - s)) / Math.max(1, f - s);
  }
  if (day >= dataDay) return pctNow;
  return (pctNow * (day - s)) / Math.max(1, dataDay - s);
}
