// Primavera P6 XER import. Converts the tab-delimited XER tables into a
// Keel import bundle so existing P6 programmes migrate in one step.

import { toDay, fromDay } from './dates.js';

export function parseXerTables(text) {
  const tables = {};
  let current = null;
  let fields = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw) continue;
    const parts = raw.split('\t');
    const tag = parts[0];
    if (tag === '%T') {
      current = parts[1];
      tables[current] = [];
      fields = null;
    } else if (tag === '%F') {
      fields = parts.slice(1);
    } else if (tag === '%R' && current && fields) {
      const row = {};
      fields.forEach((f, i) => (row[f] = parts[i + 1] ?? ''));
      tables[current].push(row);
    }
  }
  return tables;
}

const TASK_TYPES = {
  TT_Task: 'task',
  TT_Rsrc: 'task',
  TT_Mile: 'start-milestone',
  TT_FinMile: 'finish-milestone',
  TT_LOE: 'loe',
  TT_WBS: 'loe',
};
const CSTR = {
  CS_MSO: 'MSO',
  CS_MANDSTART: 'MSO',
  CS_MEO: 'MFO',
  CS_MANDFIN: 'MFO',
  CS_MSOA: 'SNET',
  CS_MSOB: 'SNLT',
  CS_MEOA: 'FNET',
  CS_MEOB: 'FNLT',
  CS_ALAP: 'ALAP',
};
const REL = { PR_FS: 'FS', PR_SS: 'SS', PR_FF: 'FF', PR_SF: 'SF' };
const RSRC = { RT_Labor: 'labour', RT_Equip: 'equipment', RT_Mat: 'material' };

const d10 = (s) => (s ? String(s).slice(0, 10) : null);

/** Best-effort decode of P6's clndr_data blob: working weekdays and holidays. */
export function parseClndrData(data = '') {
  const workDays = [];
  const dow = data.indexOf('DaysOfWeek');
  if (dow >= 0) {
    const exc = data.indexOf('Exceptions', dow);
    const block = data.slice(dow, exc > 0 ? exc : undefined);
    const re = /\(0\|\|([1-7])\(\)/g;
    const marks = [];
    let m;
    while ((m = re.exec(block))) marks.push({ day: Number(m[1]), at: m.index });
    marks.forEach((mk, i) => {
      const seg = block.slice(mk.at, marks[i + 1]?.at ?? block.length);
      if (/s\|\d/.test(seg)) workDays.push(mk.day - 1); // P6: 1 = Sunday
    });
  }
  const holidays = [];
  const exc = data.indexOf('Exceptions');
  if (exc >= 0) {
    const re = /\(d\|(\d+)\)\(\s*\)/g;
    let m;
    while ((m = re.exec(data.slice(exc)))) holidays.push(fromDay(toDay('1899-12-30') + Number(m[1])));
  }
  return { workDays: workDays.length ? workDays : [1, 2, 3, 4, 5], holidays };
}

/**
 * @returns {Array<{project, calendars, wbs, activities, relationships, resources, assignments}>}
 */
export function xerToBundles(text) {
  const t = parseXerTables(text);
  if (!t.PROJECT || !t.TASK) throw new Error('Not a valid XER file: PROJECT or TASK table missing');

  const calendars = (t.CALENDAR || []).map((c) => {
    const parsed = parseClndrData(c.clndr_data);
    return {
      id: `xer-cal-${c.clndr_id}`,
      name: c.clndr_name || `Calendar ${c.clndr_id}`,
      hoursPerDay: Number(c.day_hr_cnt) || 8,
      workDays: parsed.workDays,
      holidays: parsed.holidays,
    };
  });
  const calHours = new Map((t.CALENDAR || []).map((c) => [c.clndr_id, Number(c.day_hr_cnt) || 8]));

  const rates = new Map();
  for (const r of t.RSRCRATE || []) if (!rates.has(r.rsrc_id)) rates.set(r.rsrc_id, Number(r.cost_per_qty) || 0);
  const resources = (t.RSRC || []).map((r) => ({
    id: `xer-res-${r.rsrc_id}`,
    code: r.rsrc_short_name || `R${r.rsrc_id}`,
    name: r.rsrc_name || r.rsrc_short_name,
    type: RSRC[r.rsrc_type] || 'labour',
    rate: rates.get(r.rsrc_id) || Number(r.cost_per_qty) || 0,
    calendarId: r.clndr_id ? `xer-cal-${r.clndr_id}` : 'default',
    discipline: '',
  }));

  return t.PROJECT.filter((p) => p.export_flag !== 'N').map((p) => {
    const pid = p.proj_id;
    const tasks = t.TASK.filter((x) => x.proj_id === pid);
    const taskIds = new Set(tasks.map((x) => x.task_id));
    const hpd = (x) => calHours.get(x.clndr_id) || calHours.get(p.clndr_id) || 8;

    const wbsRows = (t.PROJWBS || []).filter((w) => w.proj_id === pid);
    const rootIds = new Set(wbsRows.filter((w) => w.proj_node_flag === 'Y').map((w) => w.wbs_id));
    const wbs = wbsRows
      .filter((w) => !rootIds.has(w.wbs_id))
      .map((w) => ({
        id: `xer-wbs-${w.wbs_id}`,
        parentId: w.parent_wbs_id && !rootIds.has(w.parent_wbs_id) ? `xer-wbs-${w.parent_wbs_id}` : null,
        code: w.wbs_short_name,
        name: w.wbs_name || w.wbs_short_name,
        sort: Number(w.seq_num) || 0,
      }));
    const wbsIds = new Set(wbs.map((w) => w.id));

    const activities = tasks.map((x) => {
      const h = hpd(x);
      const status = x.status_code;
      const pctType = x.complete_pct_type;
      return {
        id: `xer-task-${x.task_id}`,
        code: x.task_code,
        name: x.task_name,
        wbsId: wbsIds.has(`xer-wbs-${x.wbs_id}`) ? `xer-wbs-${x.wbs_id}` : null,
        type: TASK_TYPES[x.task_type] || 'task',
        duration: Math.round((Number(x.target_drtn_hr_cnt) || 0) / h),
        remaining: status === 'TK_Active' ? Math.round((Number(x.remain_drtn_hr_cnt) || 0) / h) : undefined,
        calendarId: x.clndr_id ? `xer-cal-${x.clndr_id}` : undefined,
        constraintType: CSTR[x.cstr_type] || '',
        constraintDate: d10(x.cstr_date),
        actualStart: status !== 'TK_NotStart' ? d10(x.act_start_date) : null,
        actualFinish: status === 'TK_Complete' ? d10(x.act_end_date) : null,
        pctComplete: status === 'TK_Complete' ? 100 : Number(x.phys_complete_pct) || 0,
        progressMethod: pctType === 'CP_Drtn' ? 'duration' : pctType === 'CP_Units' ? 'units' : 'physical',
        phase: '',
        discipline: '',
      };
    });

    const taskById = new Map(tasks.map((x) => [x.task_id, x]));
    const relationships = (t.TASKPRED || [])
      .filter((r) => taskIds.has(r.task_id) && taskIds.has(r.pred_task_id))
      .map((r) => {
        const succ = taskById.get(r.task_id);
        return {
          id: `xer-rel-${r.task_pred_id}`,
          predId: `xer-task-${r.pred_task_id}`,
          succId: `xer-task-${r.task_id}`,
          type: REL[r.pred_type] || 'FS',
          lag: Math.round((Number(r.lag_hr_cnt) || 0) / hpd(succ)),
        };
      });

    const assignments = (t.TASKRSRC || [])
      .filter((a) => taskIds.has(a.task_id) && a.rsrc_id)
      .map((a) => ({
        id: `xer-asg-${a.taskrsrc_id}`,
        activityId: `xer-task-${a.task_id}`,
        resourceId: `xer-res-${a.rsrc_id}`,
        budgetHours: Number(a.target_qty) || 0,
      }));

    const usedCals = new Set(activities.map((a) => a.calendarId).filter(Boolean));
    if (p.clndr_id) usedCals.add(`xer-cal-${p.clndr_id}`);
    return {
      project: {
        code: p.proj_short_name || `P${pid}`,
        name: wbsRows.find((w) => w.proj_node_flag === 'Y')?.wbs_name || p.proj_short_name || `Imported project ${pid}`,
        startDate: d10(p.plan_start_date) || d10(tasks[0]?.early_start_date) || fromDay(toDay(new Date().toISOString())),
        dataDate: d10(p.last_recalc_date) || d10(p.next_data_date) || d10(p.plan_start_date),
        mustFinishBy: d10(p.plan_end_date) || null,
        calendarId: p.clndr_id ? `xer-cal-${p.clndr_id}` : 'default',
        source: 'Primavera P6 (XER)',
      },
      calendars: calendars.filter((c) => usedCals.has(c.id)),
      wbs,
      activities,
      relationships,
      resources,
      assignments,
    };
  });
}
