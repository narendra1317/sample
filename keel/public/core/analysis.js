// One-call project analysis used by the portfolio, dashboards and reports.
// Pure functions — runs identically on the server and in the browser.

import { toDay, fromDay, weekStartDay, fmtDate } from './dates.js';
import { buildCalendars } from './calendar.js';
import { schedule, rollupWbs, isMilestone } from './cpm.js';
import { earnedValue, timesheetEntries, groupBy } from './evm.js';
import { deliverableStatus, procurementStatus, registerProgress } from './registers.js';
import { forecastLoad, actualHoursByAssignment, timesheetFlags } from './resources.js';

export function projectCalendarContext(project, calendars) {
  const cals = calendars instanceof Map ? calendars : buildCalendars(calendars);
  const pcal = cals.get(project.calendarId) || cals.get('default');
  const calOf = (a) => cals.get(a?.calendarId) || pcal;
  return { cals, pcal, calOf };
}

export function activeBaseline(bundle) {
  const { project, baselines = [] } = bundle;
  return baselines.find((b) => b.id === project.activeBaselineId) || null;
}

/**
 * @param {object} bundle { project, wbs, activities, relationships, assignments, baselines, risks, deliverables, procurement, changes }
 * @param {object} ctx { resources, calendars, timesheets }
 */
export function analyseProject(bundle, ctx) {
  const { project, wbs = [], activities = [], relationships = [], assignments = [], risks = [], deliverables = [], procurement = [], changes = [] } = bundle;
  const { cals, pcal, calOf } = projectCalendarContext(project, ctx.calendars);
  const sched = schedule({ project, activities, relationships, calendars: cals });
  const baseline = activeBaseline(bundle);
  const regPct = registerProgress(deliverables, procurement);
  const projTimesheets = ctx.timesheets || [];
  const entries = timesheetEntries(projTimesheets).filter((e) => e.projectId === project.id);
  const evm = earnedValue({ project, activities, assignments, resources: ctx.resources, baseline, sched, calendar: pcal, actualCostEntries: entries, registerPct: regPct });
  const rollup = rollupWbs(wbs, activities, sched, (a) => evm.budgets.get(a.id)?.total || Number(a.duration || 0) || 1);

  // baseline variance (working days, +ve = late)
  const variance = new Map();
  if (baseline) {
    for (const a of activities) {
      const b = baseline.activities?.[a.id];
      const r = sched.byId.get(a.id);
      if (!b || !r) continue;
      const cal = calOf(a);
      variance.set(a.id, {
        start: b.start ? cal.between(toDay(b.start), toDay(r.start)) : null,
        finish: b.finish ? cal.between(toDay(b.finish) + 1, toDay(r.finish) + 1) : null,
        blStart: b.start,
        blFinish: b.finish,
      });
    }
  }
  const baselineFinish = baseline?.finish || null;
  const finishVariance = baselineFinish ? pcal.between(toDay(baselineFinish) + 1, sched.finishPoint) : null;
  const target = project.mustFinishBy || baselineFinish;
  const floatToTarget = target ? pcal.between(sched.finishPoint, toDay(target) + 1) : null;

  const docStatus = new Map(deliverables.map((d) => [d.id, deliverableStatus(d, project.dataDate)]));
  const poStatus = new Map(procurement.map((p) => [p.id, procurementStatus(p, { sched, dataDate: project.dataDate })]));

  const openRisks = risks.filter((r) => r.status !== 'closed');
  const riskExposure = openRisks.reduce((s, r) => s + Number(r.probability || 0) * Number(r.impactCost || 0), 0);
  const counts = {
    activities: activities.length,
    complete: activities.filter((a) => a.actualFinish).length,
    inProgress: activities.filter((a) => a.actualStart && !a.actualFinish).length,
    critical: sched.criticalIds.length,
    negativeFloat: [...sched.byId.values()].filter((r) => r.tf !== null && r.tf < 0).length,
    minFloat: Math.min(...[...sched.byId.values()].filter((r) => r.tf !== null).map((r) => r.tf), Infinity),
    openRisks: openRisks.length,
    highRisks: openRisks.filter((r) => riskScore(r) >= 12).length,
    overdueDocs: [...docStatus.values()].filter((s) => s.overdue).length,
    latePOs: [...poStatus.values()].filter((s) => s.rag === 'red').length,
    pendingChanges: changes.filter((c) => c.status === 'pending' || c.status === 'submitted').length,
  };

  const kpis = {
    finish: sched.projectFinish,
    baselineFinish,
    finishVariance,
    target,
    floatToTarget,
    spi: evm.spi,
    cpi: evm.cpi,
    spiT: evm.spiT,
    percentComplete: evm.percentComplete,
    bac: evm.bac,
    eac: evm.eac,
    ac: evm.ac,
    ev: evm.ev,
    pv: evm.pv,
    riskExposure,
    ...counts,
  };
  kpis.rag = ragFor(kpis);

  return { project, sched, cals, pcal, calOf, evm, rollup, baseline, variance, docStatus, poStatus, kpis, entries, regPct };
}

export function riskScore(r) {
  // 5x5 matrix: probability band x impact band
  const p = Number(r.probability || 0);
  const pb = p >= 0.7 ? 5 : p >= 0.5 ? 4 : p >= 0.3 ? 3 : p >= 0.1 ? 2 : 1;
  const d = Number(r.impactDays || 0);
  const c = Number(r.impactCost || 0);
  const ib = Math.max(d >= 60 ? 5 : d >= 30 ? 4 : d >= 10 ? 3 : d >= 3 ? 2 : 1, c >= 1e6 ? 5 : c >= 250e3 ? 4 : c >= 50e3 ? 3 : c >= 10e3 ? 2 : 1);
  return pb * ib;
}

export function ragFor(k) {
  const minFloat = Number.isFinite(k.minFloat) ? k.minFloat : 0;
  const red = (k.finishVariance ?? 0) > 20 || minFloat < -10 || (k.floatToTarget !== null && k.floatToTarget < -10) || (k.spi !== null && k.spi < 0.85) || (k.cpi !== null && k.cpi < 0.85);
  if (red) return 'red';
  const amber = (k.finishVariance ?? 0) > 5 || minFloat < 0 || (k.floatToTarget !== null && k.floatToTarget < 0) || (k.spi !== null && k.spi < 0.95) || (k.cpi !== null && k.cpi < 0.95) || k.latePOs > 0;
  return amber ? 'amber' : 'green';
}

const money = (v, cur = 'GBP') => new Intl.NumberFormat('en-GB', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(v || 0);

/**
 * Rule-based "project intelligence": turns the numbers into the sentences a
 * programme manager would write in a weekly report.
 */
export function insights(an, bundle, ctx) {
  const out = [];
  const { project, activities, assignments = [], risks = [], deliverables = [], procurement = [] } = bundle;
  const { sched, evm, kpis, calOf } = an;
  const acts = new Map(activities.map((a) => [a.id, a]));
  const cur = project.currency || 'GBP';
  const push = (severity, title, detail, tab) => out.push({ severity, title, detail, tab });

  // completion vs target
  if (kpis.floatToTarget !== null) {
    if (kpis.floatToTarget < 0) push('critical', `Forecast completion ${fmtDate(kpis.finish)} is ${-kpis.floatToTarget} working days beyond target ${fmtDate(kpis.target)}`, 'Recovery plan required: review driving path, resequencing, added shifts or scope transfer.', 'schedule');
    else if (kpis.floatToTarget < 10) push('warning', `Only ${kpis.floatToTarget} working days of float to target completion`, 'Protect the critical path; any slip on driving activities hits the contractual date.', 'schedule');
    else push('good', `Forecast completion ${fmtDate(kpis.finish)} holds ${kpis.floatToTarget} days of float to target`, '', 'schedule');
  }

  // driving path narrative
  const driving = sched.longestPathIds
    .map((id) => ({ a: acts.get(id), r: sched.byId.get(id) }))
    .filter((x) => x.a && !isMilestone(x.a) && x.r.status !== 'complete')
    .sort((x, y) => x.r.es - y.r.es)
    .slice(0, 4);
  if (driving.length) push('info', 'Driving path', driving.map((x) => `${x.a.code} ${x.a.name}`).join(' → '), 'schedule');

  // EVM
  if (evm.spi !== null && evm.spi < 0.95) push(evm.spi < 0.85 ? 'critical' : 'warning', `Schedule performance SPI ${evm.spi.toFixed(2)}${evm.spiT ? ` (SPI(t) ${evm.spiT.toFixed(2)})` : ''}`, `Earned ${money(evm.ev, cur)} against ${money(evm.pv, cur)} planned to date.`, 'evm');
  if (evm.cpi !== null && evm.cpi < 0.95) push(evm.cpi < 0.85 ? 'critical' : 'warning', `Cost performance CPI ${evm.cpi.toFixed(2)} — EAC ${money(evm.eac, cur)} vs BAC ${money(evm.bac, cur)}`, `Variance at completion ${money(evm.vac, cur)}. TCPI ${evm.tcpi ? evm.tcpi.toFixed(2) : '—'} needed to recover.`, 'evm');
  if (evm.cpi !== null && evm.cpi >= 1.02 && evm.spi >= 1) push('good', `Ahead on cost and schedule (CPI ${evm.cpi.toFixed(2)}, SPI ${evm.spi.toFixed(2)})`, '', 'evm');

  // negative float
  if (kpis.negativeFloat) {
    const hard = activities.filter((a) => ['MSO', 'MFO', 'FNLT', 'SNLT'].includes(a.constraintType) && sched.byId.get(a.id)?.status !== 'complete');
    const why = hard.length ? `Driven by hard constraint ${hard.map((a) => `${a.code} (${a.constraintType} ${fmtDate(a.constraintDate)})`).join(', ')} — the work feeding it is ${-kpis.minFloat} days late for that window.` : 'Logic or the must-finish date make the target unachievable as planned.';
    push('critical', `${kpis.negativeFloat} activities carry negative float (worst ${kpis.minFloat}d)`, why, 'schedule');
  }

  // biggest slippers vs baseline
  const slips = [...an.variance.entries()]
    .filter(([id, v]) => v.finish > 5 && !acts.get(id).actualFinish)
    .sort((a, b) => b[1].finish - a[1].finish)
    .slice(0, 3);
  if (slips.length) push('warning', 'Largest slippage against baseline', slips.map(([id, v]) => `${acts.get(id).code} +${v.finish}d`).join(', '), 'schedule');

  // look-ahead readiness: activities starting in next 3 weeks without resources
  const dd = toDay(project.dataDate);
  const assigned = new Set(assignments.map((a) => a.activityId));
  const upcoming = activities.filter((a) => {
    const r = sched.byId.get(a.id);
    return r && r.status === 'not-started' && !isMilestone(a) && r.es >= dd && r.es < dd + 21;
  });
  const unresourced = upcoming.filter((a) => !assigned.has(a.id) && !Number(a.budgetCost || 0));
  if (unresourced.length) push('warning', `${unresourced.length} activities start in the next 3 weeks with no resources`, unresourced.slice(0, 4).map((a) => a.code).join(', '), 'schedule');

  // procurement vs ROS
  const late = procurement.filter((p) => an.poStatus.get(p.id)?.rag === 'red');
  for (const p of late.slice(0, 3)) {
    const s = an.poStatus.get(p.id);
    push('critical', `${p.tag || p.poNumber}: ${p.description} forecast ${-s.floatDays} days after ROS`, `Delivery ${fmtDate(s.delivery)} vs required on site ${fmtDate(s.ros)} (driven by ${acts.get(p.needActivityId)?.code || 'need date'}). Expedite or resequence.`, 'procurement');
  }

  // engineering
  const overdue = deliverables.filter((d) => an.docStatus.get(d.id)?.overdue);
  if (overdue.length) push('warning', `${overdue.length} engineering deliverables overdue on the MDR`, overdue.slice(0, 4).map((d) => `${d.docNo} (${an.docStatus.get(d.id).next})`).join(', '), 'mdr');

  // risks
  const top = risks.filter((r) => r.status !== 'closed').sort((a, b) => riskScore(b) - riskScore(a))[0];
  if (top && riskScore(top) >= 12) push('warning', `Top risk ${top.code}: ${top.title}`, `Score ${riskScore(top)}/25, ${Math.round(top.probability * 100)}% × ${top.impactDays}d / ${money(top.impactCost, cur)}. Owner: ${top.owner || 'unassigned'}.`, 'risk');

  // timesheet discipline for resources assigned to this project
  const resIds = new Set(assignments.map((a) => a.resourceId));
  const lastWeek = fromDay(weekStartDay(dd) - 7);
  const ts = (ctx.timesheets || []).filter((t) => t.weekStart === lastWeek);
  const submitted = new Set(ts.filter((t) => t.status !== 'draft').map((t) => t.resourceId));
  const activeRes = [...resIds].filter((rid) => (ctx.resources || []).find((r) => r.id === rid && r.type === 'labour'));
  const missing = activeRes.filter((rid) => !submitted.has(rid));
  if (missing.length) push('info', `${missing.length} of ${activeRes.length} project resources have not submitted week ${fmtDate(lastWeek)}`, 'Actual cost and units % progress will be understated until they do.', 'timesheets');

  const flagged = ts.filter((t) => timesheetFlags(t, (ctx.resources || []).find((r) => r.id === t.resourceId)).some((f) => f.level === 'critical'));
  if (flagged.length) push('warning', `${flagged.length} timesheets breach fatigue limits`, 'Check shift patterns against the offshore fatigue management plan.', 'timesheets');

  // hours burn vs earned
  const hoursBudget = [...evm.budgets.values()].reduce((s, b) => s + b.hours, 0);
  const hoursActual = an.entries.reduce((s, e) => s + e.hours, 0);
  if (hoursBudget && hoursActual) {
    const burn = (100 * hoursActual) / hoursBudget;
    if (burn > evm.percentComplete + 10) push('warning', `Hours burned ${burn.toFixed(0)}% vs ${evm.percentComplete.toFixed(0)}% earned`, 'Productivity below plan — check rework, scope growth or progress under-reporting.', 'evm');
  }

  const order = { critical: 0, warning: 1, info: 2, good: 3 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

export { forecastLoad, actualHoursByAssignment, groupBy };
