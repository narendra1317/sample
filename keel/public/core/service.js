// Keel application service: every business rule and API route lives here.
// The Node server wraps it with HTTP, authentication and file persistence;
// the browser "demo mode" wraps the very same code with localStorage. One
// implementation, two deployment models (SaaS / on-premise / offline demo).

import { toDay, fromDay, weekStart, isValidIso, weekStartDay } from './dates.js';
import { buildCalendars } from './calendar.js';
import { schedule } from './cpm.js';
import { analyseProject, insights } from './analysis.js';
import { activityBudgets, timesheetEntries, indexBy } from './evm.js';
import { forecastLoad, actualHoursByAssignment, utilisationMatrix, aggregateHours, timesheetFlags, timesheetTotal } from './resources.js';
import { timeImpact } from './registers.js';
import { xerToBundles } from './xer.js';
import { mspXmlToBundle } from './mspxml.js';

export const ROLES = {
  admin: 'Administrator',
  pm: 'Project Manager',
  planner: 'Planner / Project Controls',
  member: 'Team member',
};

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (m) => new HttpError(400, m);
const notFound = (what) => new HttpError(404, `${what} not found`);
const forbidden = (m = 'You do not have permission to do that') => new HttpError(403, m);

const can = {
  write: (u) => ['admin', 'pm', 'planner'].includes(u.role),
  approve: (u) => ['admin', 'pm'].includes(u.role),
  admin: (u) => u.role === 'admin',
};

// ---- field schemas -------------------------------------------------------
// s string, n number, d ISO date, b boolean, a array, o object, e:<a|b> enum
const SCHEMAS = {
  projects: {
    code: 's', name: 's', client: 's', location: 's', sector: 's', portfolio: 's', contractType: 's', currency: 's',
    status: 'e:planning|active|on-hold|closed', startDate: 'd', dataDate: 'd', mustFinishBy: 'd', calendarId: 's',
    description: 's', pmUserId: 's', activeBaselineId: 's', progressMode: 'e:retained|override', contractValue: 'n', scenarioOf: 's',
  },
  wbs: { projectId: 's', parentId: 's', code: 's', name: 's', sort: 'n' },
  activities: {
    projectId: 's', wbsId: 's', code: 's', name: 's', type: 'e:task|start-milestone|finish-milestone|loe', duration: 'n', remaining: 'n',
    calendarId: 's', constraintType: 'e:|SNET|SNLT|FNET|FNLT|MSO|MFO|ALAP', constraintDate: 'd', actualStart: 'd', actualFinish: 'd',
    pctComplete: 'n', progressMethod: 'e:physical|duration|steps|units|register', steps: 'a', budgetCost: 'n', actualCost: 'n',
    optimistic: 'n', pessimistic: 'n', discipline: 's', phase: 'e:|E|P|C|CS|PM', notes: 's', priority: 'n', area: 's', system: 's',
  },
  relationships: { projectId: 's', predId: 's', succId: 's', type: 'e:FS|SS|FF|SF', lag: 'n' },
  assignments: { projectId: 's', activityId: 's', resourceId: 's', budgetHours: 'n' },
  risks: {
    projectId: 's', code: 's', title: 's', category: 's', owner: 's', probability: 'n', impactDays: 'n', impactCost: 'n',
    activityIds: 'a', status: 'e:open|mitigating|closed|occurred', response: 'e:avoid|reduce|transfer|accept|exploit', mitigation: 's', cause: 's', effect: 's',
  },
  deliverables: {
    projectId: 's', docNo: 's', title: 's', discipline: 's', docType: 's', activityId: 's', weightHours: 'n', planned: 'o', actual: 'o', revision: 's', notes: 's',
  },
  procurement: {
    projectId: 's', tag: 's', description: 's', vendor: 's', poNumber: 's', value: 'n', currency: 's', activityId: 's', needActivityId: 's',
    rosBufferDays: 'n', leadTimeWeeks: 'n', planned: 'o', forecast: 'o', actual: 'o', expeditor: 's', notes: 's',
  },
  changes: {
    projectId: 's', ref: 's', title: 's', type: 'e:client-variation|internal|claim|scope-transfer', status: 'e:draft|submitted|pending|approved|rejected|implemented',
    costImpact: 'n', description: 's', raisedBy: 's', raisedDate: 'd', fragnet: 'a',
  },
  resources: {
    code: 's', name: 's', type: 'e:labour|equipment|material', discipline: 's', rate: 'n', maxHoursPerDay: 'n', capacityHoursPerWeek: 'n',
    calendarId: 's', email: 's', rotation: 's', company: 's', wtrOptOut: 'b', active: 'b', grade: 's', location: 's',
  },
  calendars: { name: 's', workDays: 'a', hoursPerDay: 'n', holidays: 'a' },
  users: { name: 's', email: 's', role: 'e:admin|pm|planner|member', resourceId: 's' },
};
const PROJECT_SCOPED = ['wbs', 'activities', 'relationships', 'assignments', 'risks', 'deliverables', 'procurement', 'changes'];
const GLOBAL = ['resources', 'calendars', 'users'];
const REQUIRED = {
  projects: ['code', 'name', 'startDate'],
  wbs: ['projectId', 'name'],
  activities: ['projectId', 'name'],
  relationships: ['projectId', 'predId', 'succId'],
  assignments: ['projectId', 'activityId', 'resourceId'],
  risks: ['projectId', 'title'],
  deliverables: ['projectId', 'docNo'],
  procurement: ['projectId', 'description'],
  changes: ['projectId', 'title'],
  resources: ['code', 'name'],
  calendars: ['name'],
  users: ['name', 'email', 'role'],
};

function sanitize(coll, input, { partial = false } = {}) {
  const schema = SCHEMAS[coll];
  const out = {};
  for (const [k, t] of Object.entries(schema)) {
    if (!(k in input)) continue;
    let v = input[k];
    if (v === undefined) continue;
    if (t === 's') v = v === null ? null : String(v).slice(0, 4000);
    else if (t === 'n') {
      if (v === null || v === '') v = null;
      else {
        v = Number(v);
        if (!Number.isFinite(v)) throw bad(`${k} must be a number`);
      }
    } else if (t === 'd') {
      if (v === null || v === '') v = null;
      else if (!isValidIso(String(v).slice(0, 10))) throw bad(`${k} must be a date (YYYY-MM-DD)`);
      else v = String(v).slice(0, 10);
    } else if (t === 'b') v = !!v;
    else if (t === 'a') {
      if (v === null) v = [];
      if (!Array.isArray(v)) throw bad(`${k} must be a list`);
      v = JSON.parse(JSON.stringify(v));
    } else if (t === 'o') {
      if (v === null) v = {};
      if (typeof v !== 'object' || Array.isArray(v)) throw bad(`${k} must be an object`);
      v = JSON.parse(JSON.stringify(v));
    } else if (t.startsWith('e:')) {
      const opts = t.slice(2).split('|');
      if (v === null) v = opts[0];
      if (!opts.includes(String(v))) throw bad(`${k} must be one of: ${opts.filter(Boolean).join(', ')}`);
    }
    out[k] = v;
  }
  if (!partial) for (const r of REQUIRED[coll] || []) if (out[r] === undefined || out[r] === null || out[r] === '') throw bad(`${r} is required`);
  return out;
}

export function emptyDb() {
  return {
    meta: { version: 1, org: { name: 'My EPC Consultancy', currency: 'GBP' }, createdAt: new Date().toISOString() },
    users: [],
    calendars: [],
    resources: [],
    projects: [],
    wbs: [],
    activities: [],
    relationships: [],
    assignments: [],
    baselines: [],
    timesheets: [],
    risks: [],
    deliverables: [],
    procurement: [],
    changes: [],
    audit: [],
  };
}

export function ensureDb(db) {
  const base = emptyDb();
  for (const k of Object.keys(base)) if (db[k] === undefined) db[k] = base[k];
  return db;
}

export function publicUser(u) {
  if (!u) return null;
  const { pwHash, salt, ...rest } = u;
  return rest;
}

const defaultId = (prefix) => `${prefix}_${(globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '').slice(0, 16)}`;

export function createService({ db, now = () => new Date(), newId = defaultId, hashPassword = null, onChange = () => {} }) {
  ensureDb(db);
  const nowIso = () => now().toISOString();

  const audit = (user, action, entity, entityId, summary) => {
    db.audit.push({ id: newId('aud'), ts: nowIso(), userId: user?.id || null, userName: user?.name || 'system', action, entity, entityId, summary });
    if (db.audit.length > 5000) db.audit.splice(0, db.audit.length - 5000);
  };

  const find = (coll, id) => db[coll].find((x) => x.id === id);
  const mustFind = (coll, id, label = coll) => {
    const x = find(coll, id);
    if (!x) throw notFound(label.replace(/s$/, ''));
    return x;
  };
  const projectOf = (id) => mustFind('projects', id, 'project');

  const bundleOf = (projectId) => {
    const by = (c) => db[c].filter((x) => x.projectId === projectId);
    return {
      project: projectOf(projectId),
      wbs: by('wbs'),
      activities: by('activities'),
      relationships: by('relationships'),
      assignments: by('assignments'),
      baselines: by('baselines'),
      risks: by('risks'),
      deliverables: by('deliverables'),
      procurement: by('procurement'),
      changes: by('changes'),
    };
  };
  const ctx = () => ({ resources: db.resources, calendars: db.calendars, timesheets: db.timesheets });

  // ---- validation for scoped writes ---------------------------------------
  function validateScoped(coll, rec) {
    projectOf(rec.projectId);
    const inProject = (c, id, label) => {
      if (!id) return;
      const x = find(c, id);
      if (!x || x.projectId !== rec.projectId) throw bad(`${label} does not belong to this project`);
    };
    if (coll === 'activities') {
      inProject('wbs', rec.wbsId, 'WBS');
      if (rec.duration !== undefined && rec.duration !== null && rec.duration < 0) throw bad('Duration cannot be negative');
      if (rec.pctComplete !== undefined && rec.pctComplete !== null && (rec.pctComplete < 0 || rec.pctComplete > 100)) throw bad('% complete must be 0–100');
      if (rec.actualFinish && !rec.actualStart) throw bad('An actual finish needs an actual start');
      if (rec.actualFinish && rec.actualStart && rec.actualFinish < rec.actualStart) throw bad('Actual finish is before actual start');
      if (rec.constraintType && rec.constraintType !== 'ALAP' && !rec.constraintDate) throw bad('This constraint needs a date');
    }
    if (coll === 'wbs') inProject('wbs', rec.parentId, 'Parent WBS');
    if (coll === 'relationships') {
      inProject('activities', rec.predId, 'Predecessor');
      inProject('activities', rec.succId, 'Successor');
      if (rec.predId === rec.succId) throw bad('An activity cannot depend on itself');
      const dup = db.relationships.find((r) => r.id !== rec.id && r.predId === rec.predId && r.succId === rec.succId);
      if (dup) throw bad('That relationship already exists');
    }
    if (coll === 'assignments') {
      inProject('activities', rec.activityId, 'Activity');
      if (!find('resources', rec.resourceId)) throw bad('Unknown resource');
    }
    if (['deliverables', 'procurement'].includes(coll)) {
      inProject('activities', rec.activityId, 'Linked activity');
      inProject('activities', rec.needActivityId, 'Need-date activity');
    }
  }

  function create(user, coll, body) {
    if (coll === 'users' ? !can.admin(user) : !can.write(user)) throw forbidden();
    const clean = sanitize(coll, body);
    const rec = { id: newId(coll.slice(0, 3)), ...clean };
    if (coll === 'resources' && rec.active === undefined) rec.active = true;
    if (coll === 'activities') {
      rec.type = rec.type || 'task';
      rec.duration = rec.duration ?? (rec.type === 'task' ? 5 : 0);
      rec.pctComplete = rec.pctComplete ?? 0;
      rec.progressMethod = rec.progressMethod || 'physical';
      if (!rec.code) rec.code = nextActivityCode(rec.projectId);
    }
    if (coll === 'relationships') {
      rec.type = rec.type || 'FS';
      rec.lag = rec.lag ?? 0;
    }
    if (coll === 'users') {
      if (db.users.some((u) => u.email.toLowerCase() === rec.email.toLowerCase())) throw bad('A user with that email already exists');
      if (!body.password || String(body.password).length < 8) throw bad('Password must be at least 8 characters');
      Object.assign(rec, hashPassword ? hashPassword(String(body.password)) : { pwHash: '', salt: '' });
    }
    if (PROJECT_SCOPED.includes(coll)) validateScoped(coll, rec);
    db[coll].push(rec);
    audit(user, 'create', coll, rec.id, rec.code || rec.name || rec.title || rec.docNo || rec.tag || '');
    return coll === 'users' ? publicUser(rec) : rec;
  }

  function update(user, coll, id, body) {
    const rec = mustFind(coll, id);
    if (coll === 'users') {
      if (!can.admin(user) && user.id !== id) throw forbidden();
      if (!can.admin(user) && body.role && body.role !== rec.role) throw forbidden('Only an administrator can change roles');
    } else if (!can.write(user)) throw forbidden();
    const clean = sanitize(coll, body, { partial: true });
    delete clean.projectId; // records never move between projects
    const next = { ...rec, ...clean };
    if (PROJECT_SCOPED.includes(coll)) validateScoped(coll, next);
    if (coll === 'users' && body.password) {
      if (String(body.password).length < 8) throw bad('Password must be at least 8 characters');
      Object.assign(next, hashPassword ? hashPassword(String(body.password)) : {});
    }
    if (coll === 'calendars' && next.workDays && !next.workDays.length) throw bad('A calendar needs at least one working day');
    Object.assign(rec, next);
    if (coll === 'activities' && rec.actualFinish) rec.pctComplete = 100;
    audit(user, 'update', coll, id, Object.keys(clean).join(', '));
    return coll === 'users' ? publicUser(rec) : rec;
  }

  function remove(user, coll, id) {
    const rec = mustFind(coll, id);
    if (coll === 'users' ? !can.admin(user) : !can.write(user)) throw forbidden();
    if (coll === 'users' && id === user.id) throw bad('You cannot delete your own account');
    if (coll === 'resources' && db.timesheets.some((t) => t.resourceId === id)) throw new HttpError(409, 'This resource has timesheet history — mark it inactive instead');
    if (coll === 'calendars' && (db.projects.some((p) => p.calendarId === id) || db.activities.some((a) => a.calendarId === id))) throw new HttpError(409, 'Calendar is in use');
    db[coll] = db[coll].filter((x) => x.id !== id);
    if (coll === 'activities') {
      db.relationships = db.relationships.filter((r) => r.predId !== id && r.succId !== id);
      db.assignments = db.assignments.filter((a) => a.activityId !== id);
      for (const d of db.deliverables) if (d.activityId === id) d.activityId = null;
      for (const p of db.procurement) {
        if (p.activityId === id) p.activityId = null;
        if (p.needActivityId === id) p.needActivityId = null;
      }
    }
    if (coll === 'wbs') {
      for (const a of db.activities) if (a.wbsId === id) a.wbsId = rec.parentId || null;
      for (const w of db.wbs) if (w.parentId === id) w.parentId = rec.parentId || null;
    }
    if (coll === 'resources') db.assignments = db.assignments.filter((a) => a.resourceId !== id);
    audit(user, 'delete', coll, id, rec.code || rec.name || rec.title || '');
    return { ok: true };
  }

  function nextActivityCode(projectId) {
    const p = find('projects', projectId);
    const nums = db.activities
      .filter((a) => a.projectId === projectId)
      .map((a) => Number(String(a.code || '').replace(/^\D+/, '')))
      .filter(Number.isFinite);
    const n = (nums.length ? Math.max(...nums) : 1000) + 10;
    return `${(p?.code || 'A').replace(/[^A-Z0-9]/gi, '').slice(0, 4).toUpperCase()}${n}`;
  }

  // ---- projects --------------------------------------------------------------
  function createProject(user, body) {
    if (!can.write(user)) throw forbidden();
    const clean = sanitize('projects', body);
    const p = {
      id: newId('prj'),
      status: 'active',
      currency: db.meta.org.currency || 'GBP',
      calendarId: 'default',
      progressMode: 'retained',
      ...clean,
    };
    p.dataDate = p.dataDate || p.startDate;
    if (db.projects.some((x) => x.code === p.code)) throw bad('Project code already in use');
    db.projects.push(p);
    if (body.template === 'epc') applyEpcTemplate(p);
    audit(user, 'create', 'projects', p.id, p.code);
    return p;
  }

  function applyEpcTemplate(p) {
    const phases = [
      ['PM', 'Project Management', ['Kick-off & execution plan', 'Project controls setup']],
      ['E', 'Engineering', ['Process', 'Mechanical & Piping', 'Electrical, Instrumentation & Control', 'Civil & Structural']],
      ['P', 'Procurement', ['Long-lead equipment', 'Bulk materials']],
      ['C', 'Construction / Fabrication', ['Site preparation', 'Installation']],
      ['CS', 'Commissioning & Handover', ['Mechanical completion', 'Commissioning', 'Handover']],
    ];
    phases.forEach(([code, name, subs], i) => {
      const w = { id: newId('wbs'), projectId: p.id, parentId: null, code: `${p.code}.${code}`, name, sort: i };
      db.wbs.push(w);
      subs.forEach((s, j) => db.wbs.push({ id: newId('wbs'), projectId: p.id, parentId: w.id, code: `${w.code}.${j + 1}`, name: s, sort: j }));
    });
    const start = { id: newId('act'), projectId: p.id, wbsId: db.wbs.find((w) => w.projectId === p.id)?.id, code: `${p.code}-MS000`, name: 'Contract award / Notice to proceed', type: 'start-milestone', duration: 0, pctComplete: 0, progressMethod: 'physical', phase: 'PM' };
    db.activities.push(start);
  }

  function deleteProject(user, id) {
    if (!can.admin(user) && !can.approve(user)) throw forbidden();
    const p = projectOf(id);
    for (const c of [...PROJECT_SCOPED, 'baselines']) db[c] = db[c].filter((x) => x.projectId !== id);
    db.projects = db.projects.filter((x) => x.id !== id);
    audit(user, 'delete', 'projects', id, p.code);
    return { ok: true };
  }

  function copyProject(user, id, body = {}) {
    if (!can.write(user)) throw forbidden();
    const src = bundleOf(id);
    const map = new Map();
    const nid = (old, prefix) => {
      if (!old) return old;
      if (!map.has(old)) map.set(old, newId(prefix));
      return map.get(old);
    };
    const code = body.code || `${src.project.code}-WI${db.projects.filter((p) => p.scenarioOf === id).length + 1}`;
    if (db.projects.some((x) => x.code === code)) throw bad('Project code already in use');
    const p = { ...structuredClone(src.project), id: newId('prj'), code, name: body.name || `${src.project.name} (what-if)`, scenarioOf: id, activeBaselineId: null, status: 'planning' };
    db.projects.push(p);
    for (const w of src.wbs) db.wbs.push({ ...structuredClone(w), id: nid(w.id, 'wbs'), projectId: p.id, parentId: nid(w.parentId, 'wbs') });
    for (const a of src.activities) db.activities.push({ ...structuredClone(a), id: nid(a.id, 'act'), projectId: p.id, wbsId: nid(a.wbsId, 'wbs') });
    for (const r of src.relationships) db.relationships.push({ ...r, id: newId('rel'), projectId: p.id, predId: nid(r.predId, 'act'), succId: nid(r.succId, 'act') });
    for (const a of src.assignments) db.assignments.push({ ...a, id: newId('asg'), projectId: p.id, activityId: nid(a.activityId, 'act') });
    for (const r of src.risks) db.risks.push({ ...structuredClone(r), id: newId('rsk'), projectId: p.id, activityIds: (r.activityIds || []).map((x) => nid(x, 'act')) });
    audit(user, 'copy', 'projects', p.id, `${code} from ${src.project.code}`);
    return p;
  }

  function captureBaseline(user, projectId, body = {}) {
    if (!can.write(user)) throw forbidden();
    const b = bundleOf(projectId);
    const sched = schedule({ project: b.project, activities: b.activities, relationships: b.relationships, calendars: db.calendars });
    const budgets = activityBudgets(b.activities, b.assignments, db.resources);
    const acts = {};
    for (const a of b.activities) {
      const r = sched.byId.get(a.id);
      acts[a.id] = { start: r.start, finish: r.finish, duration: Number(a.duration || 0), budget: budgets.get(a.id).total, hours: budgets.get(a.id).hours };
    }
    const bl = {
      id: newId('bl'),
      projectId,
      name: body.name || `Baseline ${b.baselines.length + 1}`,
      createdAt: nowIso(),
      createdBy: user.name,
      dataDate: b.project.dataDate,
      finish: sched.projectFinish,
      budget: [...budgets.values()].reduce((s, x) => s + x.total, 0),
      activities: acts,
    };
    db.baselines.push(bl);
    if (!b.project.activeBaselineId || body.makeActive) b.project.activeBaselineId = bl.id;
    audit(user, 'baseline', 'projects', projectId, bl.name);
    return bl;
  }

  function advanceDataDate(user, projectId, body) {
    if (!can.write(user)) throw forbidden();
    const p = projectOf(projectId);
    const next = body.dataDate;
    if (!isValidIso(next)) throw bad('dataDate must be a date');
    if (next < p.dataDate && !body.allowBackwards) throw bad('New data date is before the current one');
    const an = analyseProject(bundleOf(projectId), ctx());
    p.history = p.history || [];
    p.history.push({ dataDate: p.dataDate, closedAt: nowIso(), closedBy: user.name, finish: an.kpis.finish, spi: an.kpis.spi, cpi: an.kpis.cpi, ev: an.kpis.ev, pv: an.kpis.pv, ac: an.kpis.ac, pct: an.kpis.percentComplete });
    p.dataDate = next;
    audit(user, 'period-close', 'projects', projectId, `data date → ${next}`);
    return p;
  }

  function applyLevelling(user, projectId, body) {
    if (!can.write(user)) throw forbidden();
    projectOf(projectId);
    let n = 0;
    for (const [aid, start] of Object.entries(body.starts || {})) {
      const a = find('activities', aid);
      if (!a || a.projectId !== projectId || a.actualStart || !isValidIso(start)) continue;
      a.constraintType = 'SNET';
      a.constraintDate = start;
      a.notes = `${a.notes ? a.notes + '\n' : ''}Levelled ${nowIso().slice(0, 10)}: start on/after ${start}`;
      n++;
    }
    audit(user, 'level', 'projects', projectId, `${n} activities constrained`);
    return { updated: n };
  }

  function importSchedule(user, body) {
    if (!can.write(user)) throw forbidden();
    const text = String(body.text || '');
    if (!text) throw bad('File is empty');
    let bundles;
    try {
      if (body.format === 'xer' || text.startsWith('ERMHDR')) bundles = xerToBundles(text);
      else if (body.format === 'mspxml' || text.includes('<Project')) bundles = [mspXmlToBundle(text)];
      else throw bad('Unrecognised file format — use a P6 .xer or MS Project .xml export');
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw bad(`Could not read file: ${e.message}`);
    }
    const created = [];
    for (const b of bundles) {
      const idMap = new Map();
      const nid = (old, prefix) => {
        if (!old) return null;
        if (!idMap.has(old)) idMap.set(old, newId(prefix));
        return idMap.get(old);
      };
      for (const c of b.calendars || []) {
        const existing = db.calendars.find((x) => x.name === c.name);
        if (existing) idMap.set(c.id, existing.id);
        else db.calendars.push({ ...c, id: nid(c.id, 'cal') });
      }
      const calId = (id) => (id ? idMap.get(id) || (find('calendars', id) ? id : undefined) : undefined);
      for (const r of b.resources || []) {
        const existing = db.resources.find((x) => x.code === r.code);
        if (existing) idMap.set(r.id, existing.id);
        else db.resources.push({ ...r, id: nid(r.id, 'res'), calendarId: calId(r.calendarId) || 'default', active: true });
      }
      let code = (body.code || b.project.code || 'IMP').slice(0, 20);
      while (db.projects.some((x) => x.code === code)) code = `${code}-1`;
      const p = {
        id: newId('prj'),
        status: 'active',
        currency: db.meta.org.currency || 'GBP',
        progressMode: 'retained',
        ...b.project,
        code,
        name: body.name || b.project.name,
        calendarId: calId(b.project.calendarId) || 'default',
        dataDate: b.project.dataDate || b.project.startDate,
      };
      db.projects.push(p);
      for (const w of b.wbs) db.wbs.push({ ...w, id: nid(w.id, 'wbs'), parentId: nid(w.parentId, 'wbs'), projectId: p.id });
      for (const a of b.activities) db.activities.push({ ...a, id: nid(a.id, 'act'), wbsId: nid(a.wbsId, 'wbs'), calendarId: calId(a.calendarId), projectId: p.id });
      for (const r of b.relationships) db.relationships.push({ ...r, id: newId('rel'), predId: idMap.get(r.predId), succId: idMap.get(r.succId), projectId: p.id });
      for (const a of b.assignments) db.assignments.push({ ...a, id: newId('asg'), activityId: idMap.get(a.activityId), resourceId: idMap.get(a.resourceId), projectId: p.id });
      audit(user, 'import', 'projects', p.id, `${p.code} from ${p.source}: ${b.activities.length} activities, ${b.relationships.length} relationships`);
      created.push({ id: p.id, code: p.code, name: p.name, activities: b.activities.length, relationships: b.relationships.length, resources: (b.resources || []).length });
    }
    return { created };
  }

  function runImpact(user, changeId) {
    if (!can.write(user)) throw forbidden();
    const ch = mustFind('changes', changeId, 'change');
    const b = bundleOf(ch.projectId);
    const cals = buildCalendars(db.calendars);
    ch.impact = timeImpact({ project: b.project, activities: b.activities, relationships: b.relationships, calendars: cals, change: ch });
    audit(user, 'impact', 'changes', changeId, `${ch.ref}: +${ch.impact.delayDays} working days`);
    return ch;
  }

  // ---- timesheets ------------------------------------------------------------
  function canActFor(user, resourceId) {
    return user.resourceId === resourceId || can.approve(user) || user.role === 'admin';
  }

  function getTimesheet(user, q) {
    if (q.resourceId && q.weekStart) {
      if (!canActFor(user, q.resourceId) && !can.write(user)) throw forbidden();
      const ws = weekStart(q.weekStart);
      const ts = db.timesheets.find((t) => t.resourceId === q.resourceId && t.weekStart === ws);
      return ts || { id: null, resourceId: q.resourceId, weekStart: ws, status: 'draft', lines: [] };
    }
    let list = db.timesheets;
    if (!can.write(user)) list = list.filter((t) => t.resourceId === user.resourceId);
    if (q.status) list = list.filter((t) => t.status === q.status);
    if (q.from) list = list.filter((t) => t.weekStart >= weekStart(q.from));
    if (q.to) list = list.filter((t) => t.weekStart <= q.to);
    if (q.resourceId) list = list.filter((t) => t.resourceId === q.resourceId);
    return list.map((t) => ({ ...t, total: timesheetTotal(t), flags: timesheetFlags(t, find('resources', t.resourceId)) }));
  }

  function saveTimesheet(user, body) {
    const { resourceId } = body;
    if (!find('resources', resourceId)) throw bad('Unknown resource');
    if (!canActFor(user, resourceId)) throw forbidden('You can only edit your own timesheet');
    if (!isValidIso(body.weekStart)) throw bad('weekStart must be a date');
    const ws = weekStart(body.weekStart);
    const lines = (body.lines || []).map((l) => {
      if (l.projectId) projectOf(l.projectId);
      if (l.activityId) {
        const a = find('activities', l.activityId);
        if (!a || a.projectId !== l.projectId) throw bad('Activity does not belong to the selected project');
      }
      const hours = Array.from({ length: 7 }, (_, i) => {
        const h = Number(l.hours?.[i] || 0);
        if (!Number.isFinite(h) || h < 0 || h > 24) throw bad('Hours must be between 0 and 24 per day');
        return Math.round(h * 4) / 4;
      });
      const claim = l.claimPct === '' || l.claimPct === null || l.claimPct === undefined ? null : Math.max(0, Math.min(100, Number(l.claimPct)));
      return { projectId: l.projectId || null, activityId: l.activityId || null, category: l.category || (l.activityId ? 'project' : 'overhead'), hours, note: String(l.note || '').slice(0, 500), claimPct: claim };
    });
    for (let d = 0; d < 7; d++) if (lines.reduce((s, l) => s + l.hours[d], 0) > 24) throw bad('More than 24 hours booked on one day');
    let ts = db.timesheets.find((t) => t.resourceId === resourceId && t.weekStart === ws);
    if (ts && !['draft', 'rejected'].includes(ts.status)) throw new HttpError(409, `Timesheet is ${ts.status} and can no longer be edited`);
    if (!ts) {
      ts = { id: newId('tsh'), resourceId, weekStart: ws, status: 'draft', lines: [], createdAt: nowIso() };
      db.timesheets.push(ts);
    }
    ts.lines = lines;
    ts.status = 'draft';
    ts.updatedAt = nowIso();
    return ts;
  }

  function transitionTimesheet(user, id, action, body = {}) {
    const ts = mustFind('timesheets', id, 'timesheet');
    const resource = find('resources', ts.resourceId);
    if (action === 'submit') {
      if (!canActFor(user, ts.resourceId)) throw forbidden();
      if (!['draft', 'rejected'].includes(ts.status)) throw new HttpError(409, `Cannot submit a ${ts.status} timesheet`);
      if (!timesheetTotal(ts)) throw bad('Timesheet has no hours');
      ts.status = 'submitted';
      ts.submittedAt = nowIso();
      ts.comment = body.comment || ts.comment || '';
    } else if (action === 'recall') {
      if (!canActFor(user, ts.resourceId)) throw forbidden();
      if (ts.status !== 'submitted') throw new HttpError(409, 'Only submitted timesheets can be recalled');
      ts.status = 'draft';
    } else if (action === 'approve' || action === 'reject') {
      if (!can.approve(user)) throw forbidden('Only project managers can approve timesheets');
      if (ts.status !== 'submitted') throw new HttpError(409, `Cannot ${action} a ${ts.status} timesheet`);
      if (user.resourceId && user.resourceId === ts.resourceId && user.role !== 'admin') throw forbidden('You cannot approve your own timesheet');
      ts.status = action === 'approve' ? 'approved' : 'rejected';
      ts.reviewedBy = user.name;
      ts.reviewedAt = nowIso();
      ts.comment = body.comment || '';
      if (action === 'approve') applyTimesheetProgress(user, ts);
    } else throw notFound('action');
    audit(user, action, 'timesheets', id, `${resource?.name || ts.resourceId} w/c ${ts.weekStart} (${timesheetTotal(ts)}h)`);
    return { ...ts, total: timesheetTotal(ts), flags: timesheetFlags(ts, resource) };
  }

  /** Approved timesheets feed the schedule: actual starts and claimed progress. */
  function applyTimesheetProgress(user, ts) {
    const ws = toDay(ts.weekStart);
    for (const line of ts.lines) {
      if (!line.activityId) continue;
      const a = find('activities', line.activityId);
      if (!a || a.actualFinish) continue;
      const days = line.hours.map((h, i) => (h > 0 ? ws + i : null)).filter((x) => x !== null);
      if (!days.length) continue;
      const first = fromDay(days[0]);
      const last = fromDay(days[days.length - 1]);
      if (!a.actualStart || first < a.actualStart) {
        a.actualStart = first;
        audit(user, 'auto-progress', 'activities', a.id, `actual start ${first} from timesheet`);
      }
      if (line.claimPct !== null && line.claimPct !== undefined && line.claimPct > Number(a.pctComplete || 0) && ['physical', 'duration'].includes(a.progressMethod || 'physical')) {
        a.pctComplete = line.claimPct;
        if (line.claimPct >= 100) a.actualFinish = last;
        else if (a.progressMethod === 'duration') a.remaining = Math.max(1, Math.round(Number(a.duration || 0) * (1 - line.claimPct / 100)));
        audit(user, 'auto-progress', 'activities', a.id, `${line.claimPct}% claimed via timesheet`);
      }
    }
  }

  function timesheetOptions(user, q) {
    const rid = q.resourceId || user.resourceId;
    const mine = new Set(db.assignments.filter((a) => a.resourceId === rid).map((a) => a.activityId));
    return db.projects
      .filter((p) => p.status !== 'closed' && !p.scenarioOf)
      .map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        assigned: db.activities.some((a) => a.projectId === p.id && mine.has(a.id)),
        activities: db.activities
          .filter((a) => a.projectId === p.id && a.type !== 'start-milestone' && a.type !== 'finish-milestone')
          .map((a) => ({ id: a.id, code: a.code, name: a.name, assigned: mine.has(a.id), complete: !!a.actualFinish, pctComplete: a.pctComplete, progressMethod: a.progressMethod }))
          .sort((x, y) => Number(y.assigned) - Number(x.assigned) || x.code.localeCompare(y.code)),
      }))
      .sort((x, y) => Number(y.assigned) - Number(x.assigned));
  }

  // ---- cross-project analytics ---------------------------------------------
  function portfolio() {
    return db.projects.map((p) => {
      try {
        const b = bundleOf(p.id);
        const an = analyseProject(b, ctx());
        return { project: p, kpis: an.kpis, insights: insights(an, b, ctx()).slice(0, 3) };
      } catch (e) {
        return { project: p, error: e.message };
      }
    });
  }

  function utilisation(q) {
    const cals = buildCalendars(db.calendars);
    const approvedEntries = timesheetEntries(db.timesheets, { statuses: ['approved', 'submitted'] });
    const actualByAsg = actualHoursByAssignment(approvedEntries);
    const forecast = [];
    for (const p of db.projects.filter((x) => x.status !== 'closed' && !x.scenarioOf)) {
      const b = bundleOf(p.id);
      const pcal = cals.get(p.calendarId) || cals.get('default');
      const sched = schedule({ project: p, activities: b.activities, relationships: b.relationships, calendars: cals });
      forecast.push(...forecastLoad({ project: p, activities: b.activities, assignments: b.assignments, sched, calOf: (a) => cals.get(a.calendarId) || pcal, actualHours: actualByAsg }));
    }
    const from = q.from || fromDay(weekStartDay(toDay(now().toISOString().slice(0, 10))) - 28);
    const weeks = Math.min(52, Math.max(1, Number(q.weeks || 16)));
    const resources = db.resources.filter((r) => r.active !== false && (!q.discipline || r.discipline === q.discipline));
    const m = utilisationMatrix({ resources, forecast, timesheets: db.timesheets, fromIso: from, weeks, calendars: cals });
    // per-project split for tooltips / drill-down
    const split = {};
    for (const f of forecast) {
      const k = `${f.resourceId}|${fromDay(weekStartDay(f.day))}`;
      split[k] = split[k] || {};
      split[k][f.projectId] = (split[k][f.projectId] || 0) + f.hours;
    }
    return { ...m, split };
  }

  function hoursReport(q) {
    const dims = String(q.groupBy || 'resourceId,projectId,week').split(',').filter((d) => ['resourceId', 'projectId', 'activityId', 'week', 'status'].includes(d));
    let ts = db.timesheets;
    if (q.from) ts = ts.filter((t) => t.weekStart >= weekStart(q.from));
    if (q.to) ts = ts.filter((t) => t.weekStart <= q.to);
    const statuses = q.statuses ? String(q.statuses).split(',') : ['approved', 'submitted'];
    let rows = aggregateHours(ts, dims, statuses);
    if (q.projectId) rows = rows.filter((r) => !('projectId' in r) || r.projectId === q.projectId);
    const resById = indexBy(db.resources);
    const rate = (rid) => Number(resById.get(rid)?.rate || 0);
    return rows.map((r) => ({ ...r, cost: r.resourceId ? r.hours * rate(r.resourceId) : undefined }));
  }

  // ---- router ------------------------------------------------------------------
  function route(user, method, path, body = {}, query = {}) {
    const parts = path.replace(/^\/api\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    const [a, b, c] = parts;
    const M = method.toUpperCase();

    if (a === 'me' && M === 'GET') return publicUser(user);
    if (a === 'bootstrap' && M === 'GET') {
      return {
        user: publicUser(user),
        org: db.meta.org,
        roles: ROLES,
        projects: db.projects,
        resources: db.resources,
        calendars: db.calendars.length ? db.calendars : [{ id: 'default', name: 'Standard 5-day', workDays: [1, 2, 3, 4, 5], hoursPerDay: 8, holidays: [] }],
        users: db.users.map(publicUser),
      };
    }
    if (a === 'org' && M === 'PUT') {
      if (!can.admin(user)) throw forbidden();
      db.meta.org = { ...db.meta.org, name: String(body.name || db.meta.org.name), currency: String(body.currency || db.meta.org.currency).slice(0, 3).toUpperCase() };
      audit(user, 'update', 'org', null, 'organisation settings');
      return db.meta.org;
    }
    if (a === 'portfolio' && M === 'GET') return portfolio();
    if (a === 'utilisation' && M === 'GET') return utilisation(query);
    if (a === 'reports' && b === 'hours' && M === 'GET') return hoursReport(query);
    if (a === 'audit' && M === 'GET') {
      if (!can.write(user)) throw forbidden();
      let list = db.audit;
      if (query.projectId) {
        const ids = new Set([query.projectId, ...PROJECT_SCOPED.flatMap((k) => db[k].filter((x) => x.projectId === query.projectId).map((x) => x.id))]);
        list = list.filter((x) => ids.has(x.entityId));
      }
      return list.slice(-Number(query.limit || 200)).reverse();
    }
    if (a === 'import' && M === 'POST') return importSchedule(user, body);
    if (a === 'batch' && M === 'POST') {
      if (!Array.isArray(body.ops) || body.ops.length > 500) throw bad('ops must be a list of at most 500 operations');
      return body.ops.map((op) => route(user, op.method, op.path, op.body || {}, op.query || {}));
    }

    if (a === 'projects') {
      if (!b) {
        if (M === 'GET') return db.projects;
        if (M === 'POST') return createProject(user, body);
      } else if (!c) {
        if (M === 'GET') return projectOf(b);
        if (M === 'PUT') {
          const p = projectOf(b);
          if (body.code && body.code !== p.code && db.projects.some((x) => x.code === body.code)) throw bad('Project code already in use');
          if (body.activeBaselineId && !db.baselines.some((x) => x.id === body.activeBaselineId && x.projectId === b)) throw bad('Unknown baseline');
          return update(user, 'projects', b, body);
        }
        if (M === 'DELETE') return deleteProject(user, b);
      } else {
        if (c === 'bundle' && M === 'GET') {
          const bundle = bundleOf(b);
          const ids = new Set([b]);
          bundle.timesheets = db.timesheets.filter((t) => ['approved', 'submitted'].includes(t.status) && t.lines.some((l) => ids.has(l.projectId)));
          return bundle;
        }
        if (c === 'analysis' && M === 'GET') {
          const bun = bundleOf(b);
          const an = analyseProject(bun, ctx());
          return { kpis: an.kpis, insights: insights(an, bun, ctx()), finish: an.sched.projectFinish, warnings: an.sched.warnings };
        }
        if (c === 'baselines' && M === 'POST') return captureBaseline(user, b, body);
        if (c === 'advance' && M === 'POST') return advanceDataDate(user, b, body);
        if (c === 'copy' && M === 'POST') return copyProject(user, b, body);
        if (c === 'level' && M === 'POST') return applyLevelling(user, b, body);
      }
    }
    if (a === 'baselines' && b && M === 'DELETE') {
      if (!can.write(user)) throw forbidden();
      const bl = mustFind('baselines', b, 'baseline');
      db.baselines = db.baselines.filter((x) => x.id !== b);
      const p = find('projects', bl.projectId);
      if (p && p.activeBaselineId === b) p.activeBaselineId = null;
      audit(user, 'delete', 'baselines', b, bl.name);
      return { ok: true };
    }
    if (a === 'changes' && c === 'impact' && M === 'POST') return runImpact(user, b);

    if (a === 'timesheets') {
      if (!b && M === 'GET') return getTimesheet(user, query);
      if (!b && M === 'PUT') return saveTimesheet(user, body);
      if (b === 'options' && M === 'GET') return timesheetOptions(user, query);
      if (b && c && M === 'POST') return transitionTimesheet(user, b, c, body);
    }

    if ([...PROJECT_SCOPED, ...GLOBAL].includes(a)) {
      if (!b && M === 'GET') {
        if (a === 'users') return db.users.map(publicUser);
        return query.projectId ? db[a].filter((x) => x.projectId === query.projectId) : db[a];
      }
      if (!b && M === 'POST') return create(user, a, body);
      if (b && M === 'GET') return a === 'users' ? publicUser(mustFind(a, b)) : mustFind(a, b);
      if (b && M === 'PUT') return update(user, a, b, body);
      if (b && M === 'DELETE') return remove(user, a, b);
    }
    throw notFound('Route');
  }

  return {
    db,
    handle(user, method, path, body, query) {
      if (!user) return { status: 401, body: { error: 'Not signed in' } };
      try {
        const result = route(user, method, path, body || {}, query || {});
        if (method.toUpperCase() !== 'GET') onChange(db);
        return { status: 200, body: result };
      } catch (e) {
        if (e instanceof HttpError) return { status: e.status, body: { error: e.message } };
        return { status: 500, body: { error: e.message || 'Unexpected error' } };
      }
    },
    audit,
    bundleOf,
  };
}
