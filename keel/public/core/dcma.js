// DCMA 14-Point Schedule Assessment — built in, run on every schedule.
// (P6 and MS Project need third-party tools such as Acumen Fuse for this.)

import { toDay } from './dates.js';
import { schedule, isMilestone, HARD_CONSTRAINTS } from './cpm.js';
import { groupBy } from './evm.js';

export function dcmaAssessment({ project, activities, relationships, assignments = [], baseline, sched, calendars, calOf }) {
  const ids = new Set(activities.map((a) => a.id));
  const rels = relationships.filter((r) => ids.has(r.predId) && ids.has(r.succId));
  const byPred = groupBy(rels, 'predId');
  const bySucc = groupBy(rels, 'succId');
  const assignedIds = new Set(assignments.map((a) => a.activityId));
  const dataDay = toDay(project.dataDate);
  const incomplete = activities.filter((a) => !a.actualFinish && a.type !== 'loe');
  const tasks = incomplete.filter((a) => !isMilestone(a));
  const openIds = new Set(incomplete.map((a) => a.id));
  const incompleteRels = rels.filter((r) => openIds.has(r.succId) || openIds.has(r.predId));
  const pct = (n, d) => (d ? (100 * n) / d : 0);
  const checks = [];
  const add = (c) => checks.push({ ...c, pass: c.pass ?? null });

  // 1. Logic
  const noLogic = incomplete.filter((a) => !(bySucc.get(a.id) || []).length || !(byPred.get(a.id) || []).length);
  // project start/finish milestones are allowed one open end
  const openEnds = noLogic.filter((a) => {
    const hasP = (bySucc.get(a.id) || []).length > 0;
    const hasS = (byPred.get(a.id) || []).length > 0;
    return !(isMilestone(a) && (hasP || hasS));
  });
  add({ id: 1, name: 'Logic', description: 'Incomplete activities missing a predecessor or successor', threshold: '≤ 5%', value: pct(openEnds.length, incomplete.length), pass: pct(openEnds.length, incomplete.length) <= 5, offenders: openEnds.map((a) => a.id) });

  // 2. Leads
  const leads = incompleteRels.filter((r) => Number(r.lag) < 0);
  add({ id: 2, name: 'Leads', description: 'Relationships with negative lag', threshold: '0%', value: pct(leads.length, incompleteRels.length), pass: leads.length === 0, offenders: leads.map((r) => r.succId) });

  // 3. Lags
  const lags = incompleteRels.filter((r) => Number(r.lag) > 0);
  add({ id: 3, name: 'Lags', description: 'Relationships with positive lag', threshold: '≤ 5%', value: pct(lags.length, incompleteRels.length), pass: pct(lags.length, incompleteRels.length) <= 5, offenders: lags.map((r) => r.succId) });

  // 4. Relationship types
  const fs = incompleteRels.filter((r) => (r.type || 'FS') === 'FS');
  const nonFs = incompleteRels.filter((r) => (r.type || 'FS') !== 'FS');
  add({ id: 4, name: 'Relationship types', description: 'Finish-to-Start share of relationships', threshold: '≥ 90% FS', value: pct(fs.length, incompleteRels.length), pass: !incompleteRels.length || pct(fs.length, incompleteRels.length) >= 90, offenders: nonFs.map((r) => r.succId) });

  // 5. Hard constraints
  const hard = incomplete.filter((a) => HARD_CONSTRAINTS.has(a.constraintType));
  add({ id: 5, name: 'Hard constraints', description: 'Activities with hard (logic-breaking) constraints', threshold: '≤ 5%', value: pct(hard.length, incomplete.length), pass: pct(hard.length, incomplete.length) <= 5, offenders: hard.map((a) => a.id) });

  // 6. High float (> 44 working days)
  const highFloat = incomplete.filter((a) => (sched.byId.get(a.id)?.tf ?? 0) > 44);
  add({ id: 6, name: 'High float', description: 'Total float greater than 44 working days', threshold: '≤ 5%', value: pct(highFloat.length, incomplete.length), pass: pct(highFloat.length, incomplete.length) <= 5, offenders: highFloat.map((a) => a.id) });

  // 7. Negative float
  const negFloat = incomplete.filter((a) => (sched.byId.get(a.id)?.tf ?? 0) < 0);
  add({ id: 7, name: 'Negative float', description: 'Activities with total float below zero', threshold: '0%', value: pct(negFloat.length, incomplete.length), pass: negFloat.length === 0, offenders: negFloat.map((a) => a.id) });

  // 8. High duration
  const highDur = tasks.filter((a) => Number(a.duration || 0) > 44);
  add({ id: 8, name: 'High duration', description: 'Remaining tasks longer than 44 working days', threshold: '≤ 5%', value: pct(highDur.length, tasks.length), pass: pct(highDur.length, tasks.length) <= 5, offenders: highDur.map((a) => a.id) });

  // 9. Invalid dates
  const invalid = activities.filter((a) => (a.actualStart && toDay(a.actualStart) > dataDay) || (a.actualFinish && toDay(a.actualFinish) >= dataDay) || (a.actualFinish && !a.actualStart));
  add({ id: 9, name: 'Invalid dates', description: 'Actuals in the future or forecasts in the past', threshold: '0%', value: pct(invalid.length, activities.length), pass: invalid.length === 0, offenders: invalid.map((a) => a.id) });

  // 10. Resources
  const noRes = tasks.filter((a) => !assignedIds.has(a.id) && !Number(a.budgetCost || 0));
  add({ id: 10, name: 'Resources', description: 'Tasks with no resources or cost loaded', threshold: '0%', value: pct(noRes.length, tasks.length), pass: noRes.length === 0, offenders: noRes.map((a) => a.id) });

  // 11 & 14 need a baseline
  const bl = baseline?.activities;
  if (bl) {
    const due = activities.filter((a) => bl[a.id]?.finish && toDay(bl[a.id].finish) < dataDay && !isMilestone(a));
    const missed = due.filter((a) => !a.actualFinish || toDay(a.actualFinish) > toDay(bl[a.id].finish));
    add({ id: 11, name: 'Missed tasks', description: 'Baseline-due tasks finished late or not finished', threshold: '≤ 5%', value: pct(missed.length, due.length), pass: pct(missed.length, due.length) <= 5, offenders: missed.map((a) => a.id) });
    const completed = activities.filter((a) => a.actualFinish && !isMilestone(a) && bl[a.id]).length;
    const bei = due.length ? completed / due.length : 1;
    add({ id: 14, name: 'BEI', description: 'Baseline Execution Index: tasks completed ÷ tasks due', threshold: '≥ 0.95', value: bei, pass: bei >= 0.95, ratio: true, offenders: [] });
  } else {
    add({ id: 11, name: 'Missed tasks', description: 'Requires a baseline', threshold: '≤ 5%', value: null, pass: null, offenders: [] });
    add({ id: 14, name: 'BEI', description: 'Requires a baseline', threshold: '≥ 0.95', value: null, pass: null, ratio: true, offenders: [] });
  }

  // 12. Critical path test: delay a driving activity by 20 days, finish must move 20 days.
  const probe = activities.find((a) => sched.byId.get(a.id)?.longest && !isMilestone(a) && !a.actualFinish && a.type !== 'loe');
  if (probe) {
    const cal = calOf(probe);
    const delayed = activities.map((a) => (a.id === probe.id ? { ...a, duration: Number(a.duration || 0) + 20, remaining: a.remaining !== undefined && a.remaining !== null && a.remaining !== '' ? Number(a.remaining) + 20 : a.remaining } : a));
    const s2 = schedule({ project, activities: delayed, relationships, calendars });
    const moved = cal.between(sched.finishPoint, s2.finishPoint);
    add({ id: 12, name: 'Critical path test', description: `Added 20 days to ${probe.code}; project finish moved ${moved} days`, threshold: 'moves 20d', value: moved, pass: moved === 20, offenders: moved === 20 ? [] : [probe.id], raw: true });
  } else {
    add({ id: 12, name: 'Critical path test', description: 'No incomplete driving activity to test', threshold: 'moves 20d', value: null, pass: null, offenders: [] });
  }

  // 13. CPLI
  const target = toDay(project.mustFinishBy) ?? (bl ? toDay(baseline.finish) : null);
  if (target !== null) {
    const pcal = calOf({});
    const cpl = Math.max(1, pcal.between(dataDay, sched.finishPoint));
    const tf = pcal.between(sched.finishPoint, target + 1);
    const cpli = (cpl + tf) / cpl;
    add({ id: 13, name: 'CPLI', description: 'Critical Path Length Index vs target finish', threshold: '≥ 0.95', value: cpli, pass: cpli >= 0.95, ratio: true, offenders: [] });
  } else {
    add({ id: 13, name: 'CPLI', description: 'Requires a must-finish date or baseline', threshold: '≥ 0.95', value: null, pass: null, ratio: true, offenders: [] });
  }

  checks.sort((a, b) => a.id - b.id);
  const scored = checks.filter((c) => c.pass !== null);
  return { checks, passed: scored.filter((c) => c.pass).length, scored: scored.length, score: scored.length ? Math.round((100 * scored.filter((c) => c.pass).length) / scored.length) : 0 };
}
