import { esc, num, money, date, toast, confirmDialog, tableHtml, makeSortable } from '../../ui.js';
import { columnChart } from '../../charts.js';
import { level } from '../../../core/levelling.js';
import { forecastLoad, actualHoursByAssignment } from '../../../core/resources.js';
import { toDay, fromDay, weekStartDay, fmtDate } from '../../../core/dates.js';

export async function render(el, ctx) {
  const { bundle, an, app, ui } = ctx;
  const p = bundle.project;
  const resIds = [...new Set(bundle.assignments.map((a) => a.resourceId))];
  const resources = resIds.map((id) => app.resource(id)).filter(Boolean).sort((a, b) => a.code.localeCompare(b.code));
  ui.res = ui.res && resIds.includes(ui.res) ? ui.res : resources[0]?.id;

  const startW = weekStartDay(toDay(p.startDate));
  const endW = weekStartDay(an.sched.finishPoint);
  const weeks = Math.min(104, Math.max(4, Math.round((endW - startW) / 7) + 2));
  const util = await app.api.get('utilisation', { from: fromDay(startW), weeks });

  const actual = actualHoursByAssignment(an.entries);
  const rows = resources.map((r) => {
    const mine = bundle.assignments.filter((x) => x.resourceId === r.id);
    const budget = mine.reduce((s, x) => s + Number(x.budgetHours || 0), 0);
    const act = mine.reduce((s, x) => s + (actual.get(`${x.activityId}|${r.id}`) || 0), 0);
    return { r, count: mine.length, budget, act, remaining: Math.max(0, budget - act), cost: budget * (r.rate || 0) };
  });

  el.innerHTML = `<div class="stack">
    <div class="card"><header><h3>Resource histogram</h3>
      <select id="res">${resources.map((r) => `<option value="${esc(r.id)}" ${r.id === ui.res ? 'selected' : ''}>${esc(r.code)} — ${esc(r.name)}</option>`).join('')}</select></header>
      <div class="muted small" style="margin-bottom:8px">Weekly hours: actual booked (timesheets) for past weeks, remaining forecast for future weeks — split between this project and the resource's other projects, against weekly capacity.</div>
      <div id="hist"></div></div>
    <div class="grid g-2-1">
      <div class="card flush"><header><h3>Assigned resources</h3></header>${tableHtml(rows, [
        { label: 'Resource', render: (x) => `<b>${esc(x.r.code)}</b> ${esc(x.r.name)}<div class="muted small">${esc(x.r.discipline || '')}</div>` },
        { label: 'Activities', num: true, render: (x) => num(x.count) },
        { label: 'Budget h', num: true, render: (x) => num(x.budget) },
        { label: 'Actual h', num: true, render: (x) => num(x.act, 1) },
        { label: 'Burn', num: true, render: (x) => (x.budget ? `${num((100 * x.act) / x.budget)}%` : '—') },
        { label: 'Remaining h', num: true, render: (x) => num(x.remaining) },
        { label: 'Budget cost', num: true, render: (x) => money(x.cost) },
      ], { empty: 'No resources assigned to this project yet.' })}</div>
      <div class="card"><header><h3>Resource levelling</h3></header>
        <p class="small muted">Delays non-critical work so no resource exceeds its daily limit — optionally respecting what each person is already committed to on <b>other projects</b>.</p>
        <label class="row small" style="margin:10px 0"><input type="checkbox" id="xproj" checked> Include load from other projects</label>
        <button class="btn primary" id="level">Run levelling analysis</button>
        <div id="levelout" style="margin-top:12px"></div>
      </div>
    </div>
  </div>`;
  makeSortable(el);

  const draw = () => {
    const rid = ui.res;
    const res = app.resource(rid);
    const row = util.rows.find((x) => x.resource.id === rid);
    if (!row) {
      el.querySelector('#hist').innerHTML = '<div class="empty">No load for this resource.</div>';
      return;
    }
    const dd = toDay(p.dataDate);
    const mine = [];
    const others = [];
    const booked = [];
    util.weeks.forEach((w, i) => {
      const split = util.split[`${rid}|${w}`] || {};
      const past = toDay(w) + 7 <= dd;
      const cell = row.cells[i];
      booked.push(past ? cell.actual + cell.submitted : 0);
      mine.push(past ? 0 : split[p.id] || 0);
      others.push(past ? 0 : Object.entries(split).filter(([k]) => k !== p.id).reduce((s, [, v]) => s + v, 0));
    });
    const ddIdx = util.weeks.findIndex((w) => toDay(w) <= dd && dd < toDay(w) + 7);
    columnChart(el.querySelector('#hist'), {
      categories: util.weeks,
      stacks: [
        { name: 'Actual booked (all projects)', color: 'var(--s3)', values: booked },
        { name: `Forecast — ${p.code}`, color: 'var(--s1)', values: mine },
        { name: 'Forecast — other projects', color: 'var(--s2)', values: others },
      ],
      ref: { name: `Capacity (${num(row.cells[0].capacity)} h/wk)`, values: row.cells.map((c) => c.capacity) },
      yFormat: (v) => `${num(v)}h`,
      catFormat: (w) => fmtDate(w).slice(0, 6),
      tipTitle: (w) => `${res?.name} · w/c ${fmtDate(w)}`,
      highlight: ddIdx >= 0 ? ddIdx : null,
      height: 260,
    });
  };
  draw();
  el.querySelector('#res').onchange = (e) => {
    ui.res = e.target.value;
    draw();
  };

  el.querySelector('#level').onclick = () => {
    const xproj = el.querySelector('#xproj').checked;
    const external = [];
    if (xproj) {
      for (const row of util.rows) {
        util.weeks.forEach((w) => {
          const split = util.split[`${row.resource.id}|${w}`] || {};
          const other = Object.entries(split).filter(([k]) => k !== p.id).reduce((s, [, v]) => s + v, 0);
          if (!other) return;
          for (let d = 0; d < 5; d++) external.push({ resourceId: row.resource.id, day: toDay(w) + d, hours: other / 5 });
        });
      }
    }
    const lv = level({ project: p, activities: bundle.activities, relationships: bundle.relationships, assignments: bundle.assignments, resources: app.boot.resources, sched: an.sched, calOf: an.calOf, externalLoad: external });
    ui.levelled = lv;
    const delayed = bundle.activities.map((a) => ({ a, l: lv.byId.get(a.id), r: an.sched.byId.get(a.id) })).filter((x) => x.l.delay > 0).sort((x, y) => y.l.delay - x.l.delay);
    const moved = an.pcal.between(an.sched.finishPoint, lv.finishPoint);
    const neck = lv.bottlenecks.slice(0, 3).map((b) => `${esc(app.resource(b.resourceId)?.name || b.resourceId)} (limit ${num(b.limit)} h/day)`).join(', ');
    el.querySelector('#levelout').innerHTML = `<div class="callout ${moved > 0 ? 'warn' : ''}"><b>${delayed.length}</b> activities delayed. Levelled finish <b>${date(lv.finish)}</b> (${moved > 0 ? `+${moved}` : moved} working days vs ${date(an.sched.projectFinish)}).${neck ? `<br>Bottleneck: <b>${neck}</b> — add capacity (a second crew, overtime, subcontract) to recover the unlevelled dates.` : ''}</div>
      <div class="table-wrap" style="max-height:240px;margin-top:8px"><table class="data"><tbody>${delayed.slice(0, 30).map((x) => `<tr><td><b>${esc(x.a.code)}</b> ${esc(x.a.name)}</td><td class="num">+${x.l.delay}d</td><td class="nowrap">${date(x.l.start)}</td></tr>`).join('')}</tbody></table></div>
      <div class="row" style="margin-top:10px"><a class="btn" href="#/p/${esc(p.id)}/schedule">View on Gantt</a>${app.can('write') && delayed.length ? '<button class="btn primary" id="apply">Apply as start constraints</button>' : ''}</div>
      <p class="muted small" style="margin-top:6px">The Gantt shows levelled positions as amber outlines. Applying writes "start on or after" constraints so the levelled sequence is kept.</p>`;
    el.querySelector('#apply')?.addEventListener('click', async () => {
      if (!(await confirmDialog('Apply levelling', `Add start-on-or-after constraints to ${delayed.length} activities?`))) return;
      const starts = Object.fromEntries(delayed.map((x) => [x.a.id, x.l.start]));
      const r = await app.api.post(`projects/${p.id}/level`, { starts });
      ui.levelled = null;
      toast(`${r.updated} activities constrained`);
      ctx.reload();
    });
  };
}

export { forecastLoad };
