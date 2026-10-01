import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createService } from '../public/core/service.js';
import { buildDemoDb } from '../public/core/seed.js';
import { analyseProject, insights } from '../public/core/analysis.js';
import { bundleToMspXml, mspXmlToBundle } from '../public/core/mspxml.js';
import { simulate } from '../public/core/montecarlo.js';
import { dcmaAssessment } from '../public/core/dcma.js';
import { level } from '../public/core/levelling.js';
import { buildCalendars } from '../public/core/calendar.js';

const fresh = () => {
  const db = buildDemoDb();
  const svc = createService({ db, now: () => new Date('2026-09-30T10:00:00Z') });
  const user = (id) => db.users.find((u) => u.id === id);
  const call = (uid, method, path, body, query) => svc.handle(user(uid), method, path, body, query);
  return { db, svc, call };
};

test('demo portfolio analyses cleanly with sensible KPIs', () => {
  const { call } = fresh();
  const r = call('usr-pm', 'GET', '/api/portfolio');
  assert.equal(r.status, 200);
  assert.equal(r.body.length, 3);
  for (const p of r.body) {
    assert.ok(!p.error, p.error);
    assert.ok(p.kpis.bac > 0);
    assert.ok(p.kpis.spi > 0.5 && p.kpis.spi < 1.3, `SPI ${p.kpis.spi}`);
    assert.ok(p.kpis.cpi > 0.5 && p.kpis.cpi < 1.5, `CPI ${p.kpis.cpi}`);
    assert.ok(['red', 'amber', 'green'].includes(p.kpis.rag));
  }
});

test('role permissions are enforced', () => {
  const { call } = fresh();
  const asMember = call('usr-eng', 'POST', '/api/activities', { projectId: 'prj-p1', name: 'Sneaky' });
  assert.equal(asMember.status, 403);
  const asPlanner = call('usr-planner', 'POST', '/api/activities', { projectId: 'prj-p1', name: 'New work', duration: 4 });
  assert.equal(asPlanner.status, 200);
  assert.match(asPlanner.body.code, /^NNSG\d+/);
  const pending = call('usr-pm', 'GET', '/api/timesheets', null, { status: 'submitted' }).body;
  assert.ok(pending.length > 0, 'demo has timesheets awaiting approval');
  const plannerApproves = call('usr-planner', 'POST', `/api/timesheets/${pending[0].id}/approve`);
  assert.equal(plannerApproves.status, 403);
  assert.equal(call('usr-pm', 'POST', '/api/users', { name: 'X', email: 'x@y.z', role: 'admin', password: 'longpassword' }).status, 403);
  assert.equal(call('usr-admin', 'POST', '/api/users', { name: 'X', email: 'x@y.z', role: 'member', password: 'longpassword' }).status, 200);
});

test('validation rejects bad data and logic', () => {
  const { call } = fresh();
  assert.equal(call('usr-planner', 'POST', '/api/activities', { projectId: 'prj-p1', name: 'x', pctComplete: 140 }).status, 400);
  assert.equal(call('usr-planner', 'POST', '/api/activities', { projectId: 'prj-p1', name: 'x', actualFinish: '2026-09-01' }).status, 400);
  assert.equal(call('usr-planner', 'POST', '/api/relationships', { projectId: 'prj-p1', predId: 'act-p1-A1010', succId: 'act-p1-A1010' }).status, 400);
  assert.equal(call('usr-planner', 'POST', '/api/relationships', { projectId: 'prj-p1', predId: 'act-p1-A1000', succId: 'act-p1-A1010' }).status, 400, 'duplicate');
  assert.equal(call('usr-planner', 'POST', '/api/relationships', { projectId: 'prj-p1', predId: 'act-p2-B1100', succId: 'act-p1-A1010' }).status, 400, 'cross-project');
  assert.equal(call('usr-planner', 'PUT', '/api/activities/act-p1-A3010', { constraintType: 'SNET', constraintDate: null }).status, 400);
});

test('timesheet workflow: draft → submit → approve feeds actual start and progress', () => {
  const { db, call } = fresh();
  // engineer books time on an unstarted activity and claims progress
  const target = db.activities.find((a) => a.projectId === 'prj-p3' && !a.actualStart && a.type === 'task');
  db.assignments.push({ id: 'asg-x', projectId: 'prj-p3', activityId: target.id, resourceId: 'res-R03', budgetHours: 40 });
  const week = '2026-09-28';
  const saved = call('usr-eng', 'PUT', '/api/timesheets', {
    resourceId: 'res-R03',
    weekStart: week,
    lines: [{ projectId: 'prj-p3', activityId: target.id, hours: [0, 0, 6, 7.5, 0, 0, 0], claimPct: 30 }],
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(call('usr-eng', 'PUT', '/api/timesheets', { resourceId: 'res-R04', weekStart: week, lines: [] }).status, 403, 'cannot edit someone else');
  assert.equal(call('usr-eng', 'POST', `/api/timesheets/${saved.body.id}/submit`).status, 200);
  assert.equal(call('usr-eng', 'PUT', '/api/timesheets', { resourceId: 'res-R03', weekStart: week, lines: [] }).status, 409, 'locked once submitted');
  const ok = call('usr-pm', 'POST', `/api/timesheets/${saved.body.id}/approve`);
  assert.equal(ok.status, 200);
  const a = db.activities.find((x) => x.id === target.id);
  assert.equal(a.actualStart, '2026-09-30');
  assert.equal(a.pctComplete, 30);
  // hours report sees it
  const rep = call('usr-pm', 'GET', '/api/reports/hours', null, { from: week, to: week, groupBy: 'resourceId,projectId' });
  const row = rep.body.find((r) => r.resourceId === 'res-R03' && r.projectId === 'prj-p3');
  assert.ok(row.hours >= 13.5);
});

test('timesheet validation and fatigue flags', () => {
  const { call } = fresh();
  const over = call('usr-pm', 'PUT', '/api/timesheets', { resourceId: 'res-R15', weekStart: '2026-10-05', lines: [{ projectId: null, category: 'overhead', hours: [25, 0, 0, 0, 0, 0, 0] }] });
  assert.equal(over.status, 400);
  const long = call('usr-pm', 'PUT', '/api/timesheets', { resourceId: 'res-R13', weekStart: '2026-10-05', lines: [{ projectId: null, category: 'overhead', hours: [14, 13, 12, 12, 12, 12, 12] }] });
  assert.equal(long.status, 200);
  const list = call('usr-pm', 'GET', '/api/timesheets', null, { resourceId: 'res-R13', from: '2026-10-05' });
  const flags = list.body[0].flags.map((f) => f.message).join(' | ');
  assert.match(flags, /exceeds 12h/);
  assert.match(flags, /87h in week exceeds 84h/);
});

test('baseline, period close, what-if copy and levelling application', () => {
  const { db, call } = fresh();
  const bl = call('usr-planner', 'POST', '/api/projects/prj-p2/baselines', { name: 'Rev 1', makeActive: true });
  assert.equal(bl.status, 200);
  assert.equal(db.projects.find((p) => p.id === 'prj-p2').activeBaselineId, bl.body.id);
  const adv = call('usr-planner', 'POST', '/api/projects/prj-p2/advance', { dataDate: '2026-10-05' });
  assert.equal(adv.status, 200);
  assert.equal(adv.body.history.length, 1);
  assert.equal(call('usr-planner', 'POST', '/api/projects/prj-p2/advance', { dataDate: '2026-09-01' }).status, 400);
  const copy = call('usr-planner', 'POST', '/api/projects/prj-p1/copy', {});
  assert.equal(copy.status, 200);
  const n = (pid) => db.activities.filter((a) => a.projectId === pid).length;
  assert.equal(n(copy.body.id), n('prj-p1'));
  assert.equal(db.relationships.filter((r) => r.projectId === copy.body.id).length, db.relationships.filter((r) => r.projectId === 'prj-p1').length);
  const lv = call('usr-planner', 'POST', '/api/projects/prj-p1/level', { starts: { 'act-p1-A4000': '2027-01-04' } });
  assert.equal(lv.body.updated, 1);
  assert.equal(db.activities.find((a) => a.id === 'act-p1-A4000').constraintType, 'SNET');
});

test('time impact analysis measures fragnet delay', () => {
  const { call } = fresh();
  const r = call('usr-planner', 'POST', '/api/changes/chg-p1-CO-001/impact');
  assert.equal(r.status, 200);
  assert.ok(r.body.impact.delayDays >= 0);
  assert.equal(r.body.impact.fragnet.length, 3);
  assert.ok(r.body.impact.after >= r.body.impact.before);
});

test('P6 XER import creates a schedulable project', () => {
  const { db, call } = fresh();
  const text = fs.readFileSync(new URL('../samples/sample-p6-project.xer', import.meta.url), 'utf8');
  const r = call('usr-planner', 'POST', '/api/import', { format: 'xer', text });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const c = r.body.created[0];
  assert.equal(c.activities, 7);
  assert.equal(c.relationships, 8);
  const an = call('usr-planner', 'GET', `/api/projects/${c.id}/analysis`);
  assert.equal(an.status, 200);
  assert.equal(an.body.warnings.length, 0);
  // SNET 2 Nov on procurement drives the chain; finish lands in early 2027
  assert.ok(an.body.finish > '2026-12-31', an.body.finish);
  assert.ok(db.resources.some((x) => x.code === 'PIPENG' && x.rate === 75));
});

test('MS Project XML round trip preserves logic and durations', () => {
  const { db, svc } = fresh();
  const bundle = svc.bundleOf('prj-p3');
  const cals = buildCalendars(db.calendars);
  const an = analyseProject(bundle, { resources: db.resources, calendars: db.calendars, timesheets: db.timesheets });
  const xml = bundleToMspXml({ ...bundle, resources: db.resources, sched: an.sched, calendar: cals.get('default') });
  const back = mspXmlToBundle(xml);
  assert.equal(back.activities.length, bundle.activities.length);
  assert.equal(back.relationships.length, bundle.relationships.length);
  assert.equal(back.wbs.length, bundle.wbs.length);
  const dur = (list, code) => list.find((a) => a.code === code || a.name === bundle.activities.find((x) => x.code === code).name)?.duration;
  assert.equal(dur(back.activities, 'C1130'), 30);
});

test('Monte Carlo is reproducible and P80 >= P50 >= deterministic-ish', () => {
  const { db, svc } = fresh();
  const b = svc.bundleOf('prj-p1');
  const run = () => simulate({ project: b.project, activities: b.activities, relationships: b.relationships, calendars: db.calendars, risks: b.risks, iterations: 200, seed: 7 });
  const r1 = run();
  const r2 = run();
  assert.equal(r1.p80, r2.p80);
  assert.ok(r1.p80 >= r1.p50);
  assert.ok(r1.p90 >= r1.p80);
  assert.ok(r1.histogram.reduce((s, x) => s + x.count, 0) === 200);
  assert.ok(r1.riskRanking.length > 0);
});

test('DCMA assessment and insights run on every demo project', () => {
  const { db, svc } = fresh();
  for (const p of db.projects) {
    const b = svc.bundleOf(p.id);
    const an = analyseProject(b, { resources: db.resources, calendars: db.calendars, timesheets: db.timesheets });
    const d = dcmaAssessment({ project: p, activities: b.activities, relationships: b.relationships, assignments: b.assignments, baseline: an.baseline, sched: an.sched, calendars: an.cals, calOf: an.calOf });
    assert.equal(d.checks.length, 14);
    assert.ok(d.score >= 0 && d.score <= 100);
    const ins = insights(an, b, { resources: db.resources, timesheets: db.timesheets });
    assert.ok(Array.isArray(ins));
  }
});

test('levelling never exceeds a resource limit when it can be avoided', () => {
  const { db, svc } = fresh();
  const b = svc.bundleOf('prj-p2');
  const an = analyseProject(b, { resources: db.resources, calendars: db.calendars, timesheets: db.timesheets });
  const lv = level({ project: b.project, activities: b.activities, relationships: b.relationships, assignments: b.assignments, resources: db.resources, sched: an.sched, calOf: an.calOf });
  assert.ok(lv.finishPoint >= an.sched.finishPoint);
  for (const [rid, days] of lv.usage) {
    const lim = db.resources.find((r) => r.id === rid)?.maxHoursPerDay;
    if (!lim) continue;
    // a single assignment larger than the limit is allowed; otherwise stay within it
    const singles = Math.max(...b.assignments.filter((a) => a.resourceId === rid).map((a) => {
      const act = b.activities.find((x) => x.id === a.activityId);
      return a.budgetHours / Math.max(1, an.sched.byId.get(act.id).remaining || 1);
    }));
    for (const h of days.values()) assert.ok(h <= Math.max(lim, singles) + 1e-6, `${rid} ${h} > ${lim}`);
  }
});
