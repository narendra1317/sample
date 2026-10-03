// Microsoft Project XML (MSPDI) import and export. MSPDI is also accepted by
// Primavera P6's import wizard, so this doubles as the P6 hand-back format.

import { toDay, fromDay } from './dates.js';

// ---- tiny tolerant XML parser ------------------------------------------------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENT[e] ?? m;
  });
export const escXml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

export function parseXml(xml) {
  const root = { name: '#root', children: [], text: '' };
  const stack = [root];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([\w:.-]+)([^>]*?)(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.text += m[1];
    else if (m[3]) {
      if (m[2] === '/') {
        if (stack.length > 1) stack.pop();
      } else {
        const node = { name: m[3].replace(/^.*:/, ''), children: [], text: '' };
        top.children.push(node);
        if (!m[5]) stack.push(node);
      }
    } else if (m[6] !== undefined) top.text += decode(m[6]);
  }
  return root;
}
const kid = (n, name) => n?.children.find((c) => c.name === name);
const kids = (n, name) => (n ? n.children.filter((c) => c.name === name) : []);
const val = (n, name) => (kid(n, name)?.text ?? '').trim();

/** ISO-8601 duration (PT40H0M0S) to hours. */
export function durHours(s) {
  const m = /P(?:(\d+(?:\.\d+)?)D)?T?(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?/.exec(s || '');
  if (!m) return 0;
  return Number(m[1] || 0) * 24 + Number(m[2] || 0) + Number(m[3] || 0) / 60 + Number(m[4] || 0) / 3600;
}

const MSP_CSTR = { 0: '', 1: 'ALAP', 2: 'MSO', 3: 'MFO', 4: 'SNET', 5: 'SNLT', 6: 'FNET', 7: 'FNLT' };
const MSP_REL = { 0: 'FF', 1: 'FS', 2: 'SF', 3: 'SS' };

function projectCode(title) {
  const words = String(title || 'MSP').replace(/\.xml$/i, '').split(/[^A-Za-z0-9]+/).filter(Boolean);
  const code = words.map((w) => (/^\d+$/.test(w) ? w : w[0] + w.slice(1).replace(/\D/g, ''))).join('').toUpperCase();
  return (code.length >= 2 ? code : words.join('').toUpperCase()).slice(0, 12) || 'MSP';
}

export function mspXmlToBundle(xml) {
  const doc = parseXml(xml);
  const proj = kid(doc, 'Project');
  if (!proj) throw new Error('Not an MS Project XML file: <Project> element missing');
  const minutesPerDay = Number(val(proj, 'MinutesPerDay')) || 480;
  const hpd = minutesPerDay / 60;
  const dayStart = (val(proj, 'DefaultStartTime') || '08:00:00').split(':').map(Number);
  const isStartOfDay = (iso) => {
    const m = /T(\d\d):(\d\d)/.exec(iso || '');
    return !!m && Number(m[1]) * 60 + Number(m[2]) <= dayStart[0] * 60 + (dayStart[1] || 0);
  };
  // Remaining work that resumes part-way through a day still occupies that day:
  // count working hours already gone on the resume day, then round up to whole days.
  const remainingDays = (remHours, resumeIso) => {
    let offset = 0;
    const m = /T(\d\d):(\d\d)/.exec(resumeIso || '');
    if (m) {
      const mins = Number(m[1]) * 60 + Number(m[2]) - (dayStart[0] * 60 + (dayStart[1] || 0));
      offset = Math.max(0, Math.min(hpd, mins / 60 - (Number(m[1]) >= 13 ? 1 : 0)));
    }
    return remHours > 0 ? Math.ceil((offset + remHours) / hpd - 1e-6) : 0;
  };

  const calendars = kids(kid(proj, 'Calendars'), 'Calendar')
    .filter((c) => val(c, 'IsBaseCalendar') !== '0')
    .map((c) => {
      const workDays = [];
      const holidays = [];
      for (const wd of kids(kid(c, 'WeekDays'), 'WeekDay')) {
        const type = Number(val(wd, 'DayType'));
        if (type >= 1 && type <= 7 && val(wd, 'DayWorking') === '1') workDays.push(type - 1);
        if (type === 0 && val(wd, 'DayWorking') === '0') {
          const tp = kid(wd, 'TimePeriod');
          const from = toDay(val(tp, 'FromDate'));
          const to = toDay(val(tp, 'ToDate'));
          if (from !== null && to !== null) for (let d = from; d <= to && d - from < 60; d++) holidays.push(fromDay(d));
        }
      }
      return { id: `msp-cal-${val(c, 'UID')}`, name: val(c, 'Name') || 'Imported calendar', workDays: workDays.length ? workDays : [1, 2, 3, 4, 5], holidays, hoursPerDay: hpd };
    });
  const projectCal = val(proj, 'CalendarUID');

  const tasks = kids(kid(proj, 'Tasks'), 'Task').filter((t) => val(t, 'UID') !== '0' && val(t, 'IsNull') !== '1');
  const wbs = [];
  const activities = [];
  const relationships = [];
  const parentByLevel = [];
  for (const t of tasks) {
    const uid = val(t, 'UID');
    const level = Number(val(t, 'OutlineLevel')) || 1;
    const parent = level > 1 ? parentByLevel[level - 1] || null : null;
    if (val(t, 'Summary') === '1') {
      const id = `msp-wbs-${uid}`;
      wbs.push({ id, parentId: parent, code: val(t, 'WBS') || val(t, 'OutlineNumber'), name: val(t, 'Name'), sort: wbs.length });
      parentByLevel[level] = id;
      parentByLevel.length = level + 1;
      continue;
    }
    const hours = durHours(val(t, 'Duration'));
    const milestone = val(t, 'Milestone') === '1' || hours === 0;
    const pct = Number(val(t, 'PercentComplete')) || 0;
    const aStart = val(t, 'ActualStart');
    const aFinish = val(t, 'ActualFinish');
    const cType = MSP_CSTR[val(t, 'ConstraintType')] || '';
    activities.push({
      id: `msp-task-${uid}`,
      code: val(t, 'WBS') || `A${val(t, 'ID')}`,
      name: val(t, 'Name'),
      wbsId: parent,
      // a milestone at the start of the working day (e.g. 08:00, or with a start constraint) is a start milestone
      type: milestone ? (isStartOfDay(val(t, 'Start')) || ['SNET', 'SNLT', 'MSO'].includes(cType) ? 'start-milestone' : 'finish-milestone') : 'task',
      duration: Math.round(hours / hpd),
      remaining: aStart && !aFinish ? remainingDays(durHours(val(t, 'RemainingDuration')), val(t, 'Resume')) : undefined,
      resume: aStart && !aFinish && val(t, 'Resume') ? val(t, 'Resume').slice(0, 10) : undefined,
      constraintType: cType,
      constraintDate: cType && cType !== 'ALAP' ? val(t, 'ConstraintDate').slice(0, 10) || null : null,
      actualStart: aStart ? aStart.slice(0, 10) : null,
      actualFinish: aFinish && pct >= 100 ? aFinish.slice(0, 10) : null,
      pctComplete: pct,
      progressMethod: 'duration',
      calendarId: val(t, 'CalendarUID') && val(t, 'CalendarUID') !== '-1' ? `msp-cal-${val(t, 'CalendarUID')}` : undefined,
      notes: val(t, 'Notes'),
    });
    for (const pl of kids(t, 'PredecessorLink')) {
      const lagTenthMin = Number(val(pl, 'LinkLag')) || 0;
      relationships.push({
        id: `msp-rel-${uid}-${val(pl, 'PredecessorUID')}`,
        predId: `msp-task-${val(pl, 'PredecessorUID')}`,
        succId: `msp-task-${uid}`,
        type: MSP_REL[val(pl, 'Type')] || 'FS',
        lag: Math.round(lagTenthMin / 10 / minutesPerDay),
      });
    }
  }
  const actIds = new Set(activities.map((a) => a.id));
  const resources = kids(kid(proj, 'Resources'), 'Resource')
    .filter((r) => val(r, 'UID') !== '0' && val(r, 'Name'))
    .map((r) => ({
      id: `msp-res-${val(r, 'UID')}`,
      code: val(r, 'Initials') || val(r, 'Name').slice(0, 12),
      name: val(r, 'Name'),
      type: val(r, 'Type') === '0' ? 'material' : 'labour',
      rate: Number(val(r, 'StandardRate')) || 0,
      calendarId: 'default',
    }));
  const resIds = new Set(resources.map((r) => r.id));
  const assignments = kids(kid(proj, 'Assignments'), 'Assignment')
    .map((a) => ({
      id: `msp-asg-${val(a, 'UID')}`,
      activityId: `msp-task-${val(a, 'TaskUID')}`,
      resourceId: `msp-res-${val(a, 'ResourceUID')}`,
      budgetHours: Math.round(durHours(val(a, 'Work'))),
    }))
    .filter((a) => actIds.has(a.activityId) && resIds.has(a.resourceId));

  // Without a Status Date the plan has not been statused: MS Project leaves
  // unfinished work where it was. Use a data date no later than the earliest
  // activity so Keel reproduces MS Project's dates, and tell the user.
  const warnings = [];
  const statusDate = val(proj, 'StatusDate').slice(0, 10);
  let dataDate = statusDate;
  if (!dataDate || dataDate === 'NA') {
    const starts = [val(proj, 'StartDate').slice(0, 10), ...activities.map((a) => a.actualStart).filter(Boolean)].filter(Boolean).sort();
    dataDate = starts[0];
    warnings.push(`The file has no Status Date, so progress has not been statused in MS Project. Keel has kept MS Project's dates by setting the data date to ${dataDate}. To status the schedule, set the data date in Project settings or use Close period.`);
  }
  const startedNoProgress = activities.filter((a) => a.actualStart && !a.actualFinish && !Number(a.pctComplete)).length;
  if (startedNoProgress) warnings.push(`${startedNoProgress} task(s) have an actual start but 0% complete.`);

  // MS Project schedules constrained tasks before the project start date; widen the window to match.
  const earliestConstraint = activities.map((a) => a.constraintDate).filter(Boolean).sort()[0];
  const projectStart = [val(proj, 'StartDate').slice(0, 10), dataDate, earliestConstraint].filter(Boolean).sort()[0];

  return {
    warnings,
    project: {
      code: projectCode(val(proj, 'Title') || val(proj, 'Name')),
      name: val(proj, 'Title') || val(proj, 'Name') || 'Imported MS Project plan',
      startDate: projectStart,
      dataDate,
      // MS Project lets started tasks run on regardless of links (progress override)
      progressMode: 'override',
      mustFinishBy: val(proj, 'ScheduleFromStart') === '0' ? val(proj, 'FinishDate').slice(0, 10) : null,
      calendarId: projectCal ? `msp-cal-${projectCal}` : 'default',
      source: 'Microsoft Project (XML)',
    },
    calendars,
    wbs,
    activities,
    relationships: relationships.filter((r) => actIds.has(r.predId)),
    resources,
    assignments,
  };
}

// ---- export ----------------------------------------------------------------
const T = (name, v) => (v === null || v === undefined || v === '' ? '' : `<${name}>${escXml(v)}</${name}>`);
const dt = (iso, time = '08:00:00') => (iso ? `${iso}T${time}` : '');
const pt = (hours) => `PT${Math.round(hours)}H0M0S`;
const REV_CSTR = { '': 0, ALAP: 1, MSO: 2, MFO: 3, SNET: 4, SNLT: 5, FNET: 6, FNLT: 7 };
const REV_REL = { FF: 0, FS: 1, SF: 2, SS: 3 };

export function bundleToMspXml({ project, wbs, activities, relationships, resources, assignments, sched, calendar }) {
  const hpd = calendar?.hoursPerDay || 8;
  const uid = new Map();
  let n = 1;
  const rows = [];
  const children = new Map();
  for (const w of wbs) {
    const k = w.parentId || null;
    if (!children.has(k)) children.set(k, []);
    children.get(k).push(w);
  }
  const actsByWbs = new Map();
  for (const a of activities) {
    const k = a.wbsId || null;
    if (!actsByWbs.has(k)) actsByWbs.set(k, []);
    actsByWbs.get(k).push(a);
  }
  const walk = (parentId, level) => {
    for (const w of (children.get(parentId) || []).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))) {
      uid.set(w.id, n);
      rows.push({ kind: 'wbs', item: w, level, uid: n++ });
      walk(w.id, level + 1);
    }
    for (const a of actsByWbs.get(parentId) || []) {
      uid.set(a.id, n);
      rows.push({ kind: 'act', item: a, level, uid: n++ });
    }
  };
  walk(null, 1);

  const predsBySucc = new Map();
  for (const r of relationships) {
    if (!predsBySucc.has(r.succId)) predsBySucc.set(r.succId, []);
    predsBySucc.get(r.succId).push(r);
  }

  const tasksXml = rows
    .map((row, i) => {
      const it = row.item;
      if (row.kind === 'wbs') {
        return `<Task>${T('UID', row.uid)}${T('ID', i + 1)}${T('Name', `${it.code ? it.code + ' ' : ''}${it.name}`)}${T('OutlineLevel', row.level)}<Summary>1</Summary><Milestone>0</Milestone></Task>`;
      }
      const r = sched?.byId.get(it.id);
      const ms = it.type === 'start-milestone' || it.type === 'finish-milestone';
      const links = (predsBySucc.get(it.id) || [])
        .filter((p) => uid.has(p.predId))
        .map((p) => `<PredecessorLink>${T('PredecessorUID', uid.get(p.predId))}${T('Type', REV_REL[p.type || 'FS'])}${T('LinkLag', Math.round(Number(p.lag || 0) * hpd * 60 * 10))}<LagFormat>7</LagFormat></PredecessorLink>`)
        .join('');
      return `<Task>${T('UID', row.uid)}${T('ID', i + 1)}${T('Name', it.name)}${T('WBS', it.code)}${T('OutlineLevel', row.level)}<Summary>0</Summary>${T('Milestone', ms ? 1 : 0)}${T('Start', dt(r?.start))}${T('Finish', dt(r?.finish, '17:00:00'))}${T('Duration', pt(ms ? 0 : Number(it.duration || 0) * hpd))}<DurationFormat>7</DurationFormat>${T('PercentComplete', Math.round(Number(it.pctComplete || 0)))}${T('ActualStart', dt(it.actualStart))}${T('ActualFinish', dt(it.actualFinish, '17:00:00'))}${T('ConstraintType', REV_CSTR[it.constraintType || ''] ?? 0)}${it.constraintDate ? T('ConstraintDate', dt(it.constraintDate)) : ''}${T('Notes', it.notes)}${links}</Task>`;
    })
    .join('\n');

  const resUid = new Map();
  const resXml = resources
    .map((r, i) => {
      resUid.set(r.id, i + 1);
      return `<Resource>${T('UID', i + 1)}${T('ID', i + 1)}${T('Name', r.name)}${T('Initials', r.code)}${T('Type', r.type === 'material' ? 0 : 1)}${T('StandardRate', r.rate || 0)}</Resource>`;
    })
    .join('\n');
  const asgXml = assignments
    .filter((a) => uid.has(a.activityId) && resUid.has(a.resourceId))
    .map((a, i) => `<Assignment>${T('UID', i + 1)}${T('TaskUID', uid.get(a.activityId))}${T('ResourceUID', resUid.get(a.resourceId))}${T('Work', pt(a.budgetHours || 0))}</Assignment>`)
    .join('\n');

  const days = [1, 2, 3, 4, 5, 6, 7]
    .map((d) => {
      const working = calendar ? calendar.workDays.has(d - 1) : d >= 2 && d <= 6;
      return `<WeekDay><DayType>${d}</DayType><DayWorking>${working ? 1 : 0}</DayWorking>${working ? `<WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>${String(8 + hpd).padStart(2, '0')}:00:00</ToTime></WorkingTime></WorkingTimes>` : ''}</WeekDay>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project">
${T('Name', `${project.code}.xml`)}${T('Title', project.name)}${T('StartDate', dt(project.startDate))}${T('StatusDate', dt(project.dataDate))}<ScheduleFromStart>1</ScheduleFromStart><MinutesPerDay>${hpd * 60}</MinutesPerDay><MinutesPerWeek>${hpd * 60 * 5}</MinutesPerWeek><CalendarUID>1</CalendarUID>
<Calendars><Calendar><UID>1</UID><Name>${escXml(calendar?.name || 'Standard')}</Name><IsBaseCalendar>1</IsBaseCalendar><WeekDays>${days}</WeekDays></Calendar></Calendars>
<Tasks>
${tasksXml}
</Tasks>
<Resources>
${resXml}
</Resources>
<Assignments>
${asgXml}
</Assignments>
</Project>
`;
}

export function toCsv(rows, columns) {
  const q = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => q(c.label)).join(','), ...rows.map((r) => columns.map((c) => q(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(','))].join('\n');
}
