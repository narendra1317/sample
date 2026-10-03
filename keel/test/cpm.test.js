import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schedule } from '../public/core/cpm.js';
import { WorkCalendar } from '../public/core/calendar.js';

// 2026-10-05 is a Monday.
const project = { startDate: '2026-10-05', dataDate: '2026-10-05', calendarId: 'default' };
const A = (id, duration, extra = {}) => ({ id, code: id, name: id, type: 'task', duration, ...extra });
const R = (predId, succId, type = 'FS', lag = 0) => ({ id: `${predId}-${succId}`, predId, succId, type, lag });

test('calendar arithmetic skips weekends and holidays', () => {
  const cal = new WorkCalendar({ holidays: ['2026-12-25'] });
  const mon = 20731; // 2026-10-05
  assert.equal(cal.finishFrom(mon, 5), mon + 5); // Mon..Fri, ends Sat point
  assert.equal(cal.finishFrom(mon, 6), mon + 8); // runs into next Monday
  assert.equal(cal.startFrom(mon + 5, 5), mon);
  assert.equal(cal.shift(mon + 5, 1), mon + 8); // FS+1 from Friday finish -> Tuesday
  assert.equal(cal.between(mon, mon + 7), 5);
  assert.equal(cal.isWork(20812), false); // 2026-12-25 holiday
  assert.equal(cal.nextWork(20812), 20815); // -> Mon 28th
});

test('simple FS chain and critical path', () => {
  const s = schedule({
    project,
    activities: [A('a', 5), A('b', 3), A('c', 2), A('d', 10)],
    relationships: [R('a', 'b'), R('b', 'c'), R('a', 'd')],
  });
  const g = (id) => s.byId.get(id);
  assert.equal(g('a').start, '2026-10-05');
  assert.equal(g('a').finish, '2026-10-09');
  assert.equal(g('b').start, '2026-10-12');
  assert.equal(g('c').finish, '2026-10-16');
  assert.equal(g('d').finish, '2026-10-23');
  assert.equal(s.projectFinish, '2026-10-23');
  assert.equal(g('d').tf, 0);
  assert.equal(g('c').tf, 5);
  assert.equal(g('b').ff, 0);
  assert.equal(g('c').ff, 5);
  assert.deepEqual(new Set(s.criticalIds), new Set(['a', 'd']));
  assert.deepEqual(new Set(s.longestPathIds), new Set(['a', 'd']));
});

test('SS, FF, SF relationships with lags and leads', () => {
  const s = schedule({
    project,
    activities: [A('a', 10), A('b', 4), A('c', 3), A('d', 2), A('e', 2)],
    relationships: [R('a', 'b', 'SS', 2), R('a', 'c', 'FF', 1), R('a', 'd', 'FS', -2), R('a', 'e', 'SF', 3)],
  });
  const g = (id) => s.byId.get(id);
  assert.equal(g('b').start, '2026-10-07'); // SS+2
  assert.equal(g('c').finish, '2026-10-19'); // a finishes Fri 16th, FF+1 -> Mon 19th
  assert.equal(g('d').start, '2026-10-15'); // FS-2 lead
  assert.equal(g('e').finish, '2026-10-07'); // SF+3 -> finish by start of Thu, i.e. end of Wed
});

test('constraints and must-finish-by produce negative float', () => {
  const s = schedule({
    project: { ...project, mustFinishBy: '2026-10-14' },
    activities: [A('a', 5), A('b', 5, { constraintType: 'SNET', constraintDate: '2026-10-14' })],
    relationships: [R('a', 'b')],
  });
  assert.equal(s.byId.get('b').start, '2026-10-14');
  assert.equal(s.byId.get('b').finish, '2026-10-20');
  assert.equal(s.byId.get('b').tf, -4);
  assert.equal(s.byId.get('a').tf, -2); // the 2-day SNET gap absorbs part of the overrun
});

test('progress: complete and in-progress activities honour the data date', () => {
  const s = schedule({
    project: { ...project, dataDate: '2026-10-14' },
    activities: [
      A('a', 5, { actualStart: '2026-10-05', actualFinish: '2026-10-09', pctComplete: 100 }),
      A('b', 5, { actualStart: '2026-10-12', pctComplete: 40, remaining: 4 }),
      A('c', 2),
    ],
    relationships: [R('a', 'b'), R('b', 'c')],
  });
  const g = (id) => s.byId.get(id);
  assert.equal(g('a').status, 'complete');
  assert.equal(g('a').tf, null);
  assert.equal(g('b').start, '2026-10-12');
  assert.equal(g('b').finish, '2026-10-19'); // 4 days remaining from Wed 14th
  assert.equal(g('c').start, '2026-10-20');
});

test('milestones and loop detection', () => {
  const s = schedule({
    project,
    activities: [
      A('ms', 0, { type: 'start-milestone' }),
      A('a', 3),
      A('fm', 0, { type: 'finish-milestone' }),
      A('x', 2),
      A('y', 2),
    ],
    relationships: [R('ms', 'a'), R('a', 'fm'), R('x', 'y'), R('y', 'x')],
  });
  assert.equal(s.byId.get('ms').start, '2026-10-05');
  assert.equal(s.byId.get('fm').finish, '2026-10-07');
  assert.equal(s.warnings[0].code, 'LOOP');
});

test('level of effort spans its logic without driving it', () => {
  const s = schedule({
    project,
    activities: [A('a', 5), A('b', 5), A('loe', 1, { type: 'loe' })],
    relationships: [R('a', 'b'), R('a', 'loe', 'SS'), R('loe', 'b', 'FF')],
  });
  assert.equal(s.byId.get('loe').start, '2026-10-05');
  assert.equal(s.byId.get('loe').finish, '2026-10-16');
  assert.equal(s.byId.get('b').start, '2026-10-12');
});

test('in-progress activity whose only successors are SS links still gets a late finish', () => {
  const s = schedule({
    project: { ...project, dataDate: '2026-10-14' },
    activities: [A('a', 10, { actualStart: '2026-10-05', pctComplete: 30 }), A('b', 5), A('c', 3)],
    relationships: [R('a', 'b', 'SS', 2), R('b', 'c')],
  });
  const a = s.byId.get('a');
  assert.ok(Number.isFinite(a.lf));
  assert.ok(a.tf !== null && Number.isFinite(a.tf));
  assert.equal(s.byId.get('c').tf, 0);
});
