// EPC delivery registers that P6 / MS Project leave to spreadsheets:
//  - Master Deliverables Register (engineering documents, rules of credit)
//  - Procurement tracker (PO milestones, ROS driven by the live schedule)
//  - Change register (variations with Time Impact Analysis)

import { toDay, fromDay } from './dates.js';
import { schedule } from './cpm.js';

export const DOC_STAGES = [
  { key: 'START', label: 'Started', weight: 10 },
  { key: 'IDC', label: 'Inter-discipline check', weight: 25 },
  { key: 'IFR', label: 'Issued for review', weight: 50 },
  { key: 'IFA', label: 'Issued for approval', weight: 70 },
  { key: 'IFC', label: 'Issued for construction', weight: 100 },
];

export const PO_STAGES = [
  { key: 'MR', label: 'Requisition issued', weight: 5 },
  { key: 'PO', label: 'PO awarded', weight: 15 },
  { key: 'VDA', label: 'Vendor docs approved', weight: 30 },
  { key: 'FAT', label: 'FAT passed', weight: 70 },
  { key: 'RFS', label: 'Ready for shipment', weight: 85 },
  { key: 'DEL', label: 'Delivered to site', weight: 100 },
];

function stageProgress(stages, actual = {}) {
  let pct = 0;
  let reached = null;
  for (const s of stages) {
    if (actual[s.key]) {
      pct = s.weight;
      reached = s.key;
    }
  }
  return { pct, reached };
}

function nextStage(stages, actual = {}, planned = null) {
  // stages with no plan and no actual (e.g. no FAT for bulk materials) are not applicable
  const applicable = planned ? stages.filter((s) => planned[s.key] || actual[s.key]) : stages;
  const lastDone = applicable.reduce((i, s, j) => (actual[s.key] ? j : i), -1);
  return applicable.slice(lastDone + 1).find((s) => !actual[s.key]) || null;
}

export function deliverableStatus(d, dataDate) {
  const { pct, reached } = stageProgress(DOC_STAGES, d.actual);
  const next = nextStage(DOC_STAGES, d.actual);
  const due = next ? d.planned?.[next.key] : null;
  const overdue = !!(due && toDay(due) < toDay(dataDate));
  const daysLate = overdue ? toDay(dataDate) - toDay(due) : 0;
  return { pct, reached, next: next?.key || null, due, overdue, daysLate };
}

export function procurementStatus(p, { sched, dataDate }) {
  const { pct, reached } = stageProgress(PO_STAGES, p.actual);
  const need = p.needActivityId ? sched?.byId.get(p.needActivityId) : null;
  const buffer = Number(p.rosBufferDays ?? 0);
  // ROS = planned need date (early start of the consuming activity less a buffer).
  // Latest ROS = late start of that activity: beyond it the project finish moves.
  const ros = need ? fromDay(toDay(need.start) - buffer) : p.ros || null;
  const rosLatest = need && need.lateStart ? need.lateStart : ros;
  const delivery = p.actual?.DEL || p.forecast?.DEL || p.planned?.DEL || null;
  const floatDays = ros && delivery ? toDay(ros) - toDay(delivery) : null;
  const totalFloatDays = rosLatest && delivery ? toDay(rosLatest) - toDay(delivery) : null;
  const next = nextStage(PO_STAGES, p.actual, { ...p.planned, ...p.forecast });
  const nextDue = next ? p.forecast?.[next.key] || p.planned?.[next.key] : null;
  let rag = 'green';
  if (!p.actual?.DEL) {
    if (totalFloatDays !== null && totalFloatDays < 0) rag = 'red';
    else if (floatDays !== null && floatDays < 0) rag = 'amber';
    if (next && nextDue && toDay(nextDue) < toDay(dataDate) && rag === 'green') rag = 'amber';
  }
  return { pct, reached, ros, rosLatest, delivery, floatDays, totalFloatDays, next: next?.key || null, nextDue, rag, needActivity: need ? p.needActivityId : null };
}

/** Progress rolled up from registers for activities using the 'register' method. */
export function registerProgress(deliverables = [], procurement = []) {
  const acc = new Map();
  const add = (aid, pct, w) => {
    if (!aid) return;
    const cur = acc.get(aid) || { sum: 0, w: 0 };
    cur.sum += pct * w;
    cur.w += w;
    acc.set(aid, cur);
  };
  for (const d of deliverables) add(d.activityId, stageProgress(DOC_STAGES, d.actual).pct, Number(d.weightHours || 1));
  for (const p of procurement) add(p.activityId, stageProgress(PO_STAGES, p.actual).pct, Number(p.value || 1));
  return new Map([...acc].map(([k, v]) => [k, v.w ? v.sum / v.w : 0]));
}

/**
 * Time Impact Analysis: insert a change's fragnet (new activities + logic)
 * into a copy of the live schedule and measure the completion delay.
 */
export function timeImpact({ project, activities, relationships, calendars, change }) {
  const before = schedule({ project, activities, relationships, calendars });
  const frag = change.fragnet || [];
  const extraActs = frag.map((f, i) => ({
    id: `frag-${change.id}-${i}`,
    code: f.code || `${change.ref || 'CO'}-${i + 1}`,
    name: f.name || 'Change work',
    type: 'task',
    duration: Number(f.duration || 0),
    calendarId: f.calendarId,
  }));
  const extraRels = [];
  frag.forEach((f, i) => {
    const id = extraActs[i].id;
    if (f.predId) extraRels.push({ id: `${id}-p`, predId: f.predId, succId: id, type: 'FS', lag: Number(f.lag || 0) });
    if (i > 0 && f.chain !== false) extraRels.push({ id: `${id}-c`, predId: extraActs[i - 1].id, succId: id, type: 'FS', lag: 0 });
    if (f.succId) extraRels.push({ id: `${id}-s`, predId: id, succId: f.succId, type: 'FS', lag: 0 });
  });
  const after = schedule({ project, activities: [...activities, ...extraActs], relationships: [...relationships, ...extraRels], calendars });
  const cal = calendars instanceof Map ? calendars.get(project.calendarId) || calendars.get('default') : null;
  const delay = cal ? cal.between(before.finishPoint, after.finishPoint) : after.finishPoint - before.finishPoint;
  const impacted = activities
    .map((a) => ({ id: a.id, code: a.code, name: a.name, shift: after.byId.get(a.id).ef - before.byId.get(a.id).ef }))
    .filter((x) => x.shift > 0)
    .sort((a, b) => b.shift - a.shift);
  // When a hard constraint pins the finish, the real impact shows up as lost float.
  const minTf = (sch, ids) => Math.min(...ids.map((id) => sch.byId.get(id)?.tf).filter((x) => x !== null && x !== undefined), Infinity);
  const ids = activities.map((a) => a.id);
  const tfBefore = minTf(before, ids);
  const tfAfter = minTf(after, ids);
  const floatErosion = Number.isFinite(tfBefore) && Number.isFinite(tfAfter) ? Math.max(0, tfBefore - tfAfter) : 0;
  return {
    floatBefore: Number.isFinite(tfBefore) ? tfBefore : null,
    floatAfter: Number.isFinite(tfAfter) ? tfAfter : null,
    floatErosion,
    before: before.projectFinish,
    after: after.projectFinish,
    delayDays: delay,
    calendarDays: after.finishPoint - before.finishPoint,
    fragnet: extraActs.map((a) => ({ ...a, start: after.byId.get(a.id).start, finish: after.byId.get(a.id).finish, critical: after.byId.get(a.id).critical })),
    impacted: impacted.slice(0, 25),
    impactedCount: impacted.length,
    ranAt: new Date().toISOString(),
  };
}
