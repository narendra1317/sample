// Resource loading, weekly utilisation and timesheet compliance.

import { toDay, fromDay, weekStartDay } from './dates.js';
import { groupBy, indexBy, timesheetEntries } from './evm.js';

export const RESOURCE_TYPES = { labour: 'Labour', equipment: 'Equipment', material: 'Material' };

/** Weekly capacity in hours for a resource. */
export function weeklyCapacity(resource, cal) {
  if (resource.capacityHoursPerWeek) return Number(resource.capacityHoursPerWeek);
  // Contracted hours come from the calendar; maxHoursPerDay is the levelling ceiling, not capacity.
  const perDay = Number(cal?.hoursPerDay || 8);
  const days = cal ? cal.workDays.size : 5;
  return perDay * days;
}

/**
 * Forecast (remaining) hours per resource per day for one scheduled project.
 * Remaining hours = budget - actual (never below zero), spread evenly across
 * the remaining working days of the activity.
 * @returns {Array<{resourceId, projectId, activityId, day, hours}>}
 */
export function forecastLoad({ project, activities, assignments, sched, calOf, actualHours = new Map() }) {
  const actById = indexBy(activities);
  const out = [];
  const dataDay = toDay(project.dataDate);
  for (const as of assignments) {
    const a = actById.get(as.activityId);
    const r = sched.byId.get(as.activityId);
    if (!a || !r || r.status === 'complete') continue;
    const cal = calOf(a);
    const budget = Number(as.budgetHours || 0);
    const burned = as.actualHours !== undefined ? Number(as.actualHours) : shareOfActual(as, assignments, actualHours);
    const remaining = Math.max(0, budget - burned);
    if (!remaining) continue;
    const from = Math.max(r.es, r.status === 'in-progress' ? dataDay : r.es);
    const to = r.ef;
    const days = [];
    for (let d = from; d < to; d++) if (cal.isWork(d)) days.push(d);
    if (!days.length) continue;
    const each = remaining / days.length;
    for (const d of days) out.push({ resourceId: as.resourceId, projectId: project.id, activityId: a.id, day: d, hours: each });
  }
  return out;
}

function shareOfActual(as, assignments, actualHours) {
  // Actual hours are captured per activity per resource from timesheets.
  const key = `${as.activityId}|${as.resourceId}`;
  return actualHours.get(key) || 0;
}

/** Actual hours keyed "activityId|resourceId" from timesheet entries. */
export function actualHoursByAssignment(entries) {
  const m = new Map();
  for (const e of entries) {
    const k = `${e.activityId}|${e.resourceId}`;
    m.set(k, (m.get(k) || 0) + e.hours);
  }
  return m;
}

/**
 * Resource x week matrix combining forecast load, timesheet actuals and capacity.
 * @returns {{weeks: string[], rows: Array<{resource, cells: Array<{week, planned, actual, submitted, capacity, util}>, totals}>}}
 */
export function utilisationMatrix({ resources, forecast, timesheets, fromIso, weeks = 12, calendars }) {
  const start = weekStartDay(toDay(fromIso));
  const weekDays = Array.from({ length: weeks }, (_, i) => start + i * 7);
  const approved = timesheetEntries(timesheets, { statuses: ['approved'] });
  const pending = timesheetEntries(timesheets, { statuses: ['submitted'] });
  const key = (rid, w) => `${rid}|${w}`;
  const plan = new Map();
  const act = new Map();
  const sub = new Map();
  const add = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
  for (const f of forecast) add(plan, key(f.resourceId, weekStartDay(f.day)), f.hours);
  for (const e of approved) add(act, key(e.resourceId, weekStartDay(e.day)), e.hours);
  for (const e of pending) add(sub, key(e.resourceId, weekStartDay(e.day)), e.hours);

  const rows = resources
    .filter((r) => r.type !== 'material')
    .map((res) => {
      const cal = calendars?.get(res.calendarId) || calendars?.get('default');
      const capacity = weeklyCapacity(res, cal);
      const cells = weekDays.map((w) => {
        const planned = plan.get(key(res.id, w)) || 0;
        const actual = act.get(key(res.id, w)) || 0;
        const submitted = sub.get(key(res.id, w)) || 0;
        const load = actual + submitted > 0 ? actual + submitted : planned;
        return { week: fromDay(w), planned, actual, submitted, capacity, util: capacity ? load / capacity : 0 };
      });
      const totals = cells.reduce(
        (t, c) => ({ planned: t.planned + c.planned, actual: t.actual + c.actual, capacity: t.capacity + c.capacity }),
        { planned: 0, actual: 0, capacity: 0 },
      );
      return { resource: res, cells, totals };
    });
  return { weeks: weekDays.map(fromDay), rows };
}

/** Daily histogram for one resource: Map day -> hours. */
export function dailyHistogram(forecast, resourceId) {
  const m = new Map();
  for (const f of forecast) if (f.resourceId === resourceId) m.set(f.day, (m.get(f.day) || 0) + f.hours);
  return m;
}

export const COMPLIANCE_RULES = {
  maxDay: 12, // offshore 12-hour shift norm
  maxWeek: 84, // 7 x 12 offshore rotation ceiling
  wtrWeek: 48, // UK Working Time Regulations reference average
  minRestDays: 1,
};

/**
 * Timesheet compliance & fatigue checks for one weekly timesheet.
 * Returns an array of { level, message }.
 */
export function timesheetFlags(ts, resource, rules = COMPLIANCE_RULES) {
  const flags = [];
  const days = [0, 0, 0, 0, 0, 0, 0];
  for (const line of ts.lines || []) (line.hours || []).forEach((h, i) => (days[i] += Number(h || 0)));
  const total = days.reduce((a, b) => a + b, 0);
  const offshore = resource?.rotation && resource.rotation !== 'none';
  days.forEach((h, i) => {
    if (h > rules.maxDay) flags.push({ level: 'critical', message: `${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}: ${h}h exceeds ${rules.maxDay}h shift limit` });
  });
  if (total > rules.maxWeek) flags.push({ level: 'critical', message: `${total}h in week exceeds ${rules.maxWeek}h fatigue ceiling` });
  else if (!offshore && total > rules.wtrWeek && !resource?.wtrOptOut) flags.push({ level: 'warning', message: `${total}h exceeds 48h WTR reference (no opt-out on file)` });
  if (!offshore && days.every((h) => h > 0)) flags.push({ level: 'warning', message: 'No rest day recorded this week' });
  const unlinked = (ts.lines || []).filter((l) => !l.activityId && (l.hours || []).some((h) => Number(h) > 0));
  if (unlinked.length) flags.push({ level: 'info', message: `${unlinked.length} line(s) booked to overhead / not linked to an activity` });
  return flags;
}

export function timesheetTotal(ts) {
  let t = 0;
  for (const line of ts.lines || []) for (const h of line.hours || []) t += Number(h || 0);
  return t;
}

/** Aggregate timesheet hours for reporting. dims: any of resourceId, projectId, activityId, week, status. */
export function aggregateHours(timesheets, dims = ['resourceId', 'week'], statuses = ['approved', 'submitted']) {
  const entries = timesheetEntries(timesheets, { statuses });
  const groups = groupBy(entries, (e) =>
    dims.map((d) => (d === 'week' ? fromDay(weekStartDay(e.day)) : e[d] ?? '')).join('|'),
  );
  return [...groups.entries()].map(([k, list]) => {
    const parts = k.split('|');
    const row = {};
    dims.forEach((d, i) => (row[d] = parts[i]));
    row.hours = list.reduce((s, e) => s + e.hours, 0);
    return row;
  });
}
