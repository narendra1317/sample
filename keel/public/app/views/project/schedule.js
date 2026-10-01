import { esc, date, num, pct, money, toast, drawer, closeDrawer, formDialog, confirmDialog, modal, download, signed, icons } from '../../ui.js';
import { renderGantt } from '../../gantt.js';
import { CONSTRAINTS, isMilestone, activityStatus } from '../../../core/cpm.js';
import { PROGRESS_METHODS, stepsPercent } from '../../../core/evm.js';
import { toDay } from '../../../core/dates.js';
import { toCsv } from '../../../core/mspxml.js';

const FILTERS = {
  all: 'All activities',
  critical: 'Critical (float ≤ 0)',
  longest: 'Longest path',
  lookahead: '3-week look-ahead',
  progress: 'In progress',
  open: 'Not complete',
  behind: 'Behind baseline (> 5d)',
  negative: 'Negative float',
};
const TYPES = { task: 'Task', 'start-milestone': 'Start milestone', 'finish-milestone': 'Finish milestone', loe: 'Level of effort' };
const PHASES = { '': '—', PM: 'Project management', E: 'Engineering', P: 'Procurement', C: 'Construction', CS: 'Commissioning' };

export async function render(el, ctx) {
  const { ui, an, bundle, app } = ctx;
  ui.filter = ui.filter || 'all';
  ui.zoom = ui.zoom || 'month';
  ui.group = ui.group || 'wbs';
  ui.collapsed = ui.collapsed || new Set();
  ui.showBaseline = ui.showBaseline ?? true;
  ui.showLinks = ui.showLinks ?? false;
  const canWrite = app.can('write');

  el.innerHTML = `<div class="gantt-toolbar">
      <input type="search" id="q" placeholder="Search ID or name…" value="${esc(ui.q || '')}" style="width:200px">
      <select id="filter">${Object.entries(FILTERS).map(([k, v]) => `<option value="${k}" ${ui.filter === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <div class="seg" id="group"><button data-v="wbs" class="${ui.group === 'wbs' ? 'on' : ''}">By WBS</button><button data-v="flat" class="${ui.group === 'flat' ? 'on' : ''}">By start</button></div>
      <div class="seg" id="zoom"><button data-v="week" class="${ui.zoom === 'week' ? 'on' : ''}">Weeks</button><button data-v="month" class="${ui.zoom === 'month' ? 'on' : ''}">Months</button><button data-v="quarter" class="${ui.zoom === 'quarter' ? 'on' : ''}">Quarters</button></div>
      <label class="row small"><input type="checkbox" id="bl" ${ui.showBaseline ? 'checked' : ''}> Baseline</label>
      <label class="row small"><input type="checkbox" id="links" ${ui.showLinks ? 'checked' : ''}> Logic links</label>
      <span class="right"></span>
      <button class="btn" id="csv">${icons.download} CSV</button>
      ${canWrite ? `<button class="btn" id="progress">Progress update</button><button class="btn" id="addwbs">${icons.plus} WBS</button><button class="btn primary" id="addact">${icons.plus} Activity</button>` : ''}
    </div>
    <div id="gantt"></div>
    <div class="g-legend">
      <span class="key"><span class="sw" style="background:var(--bar);width:16px;height:10px;border-radius:3px;display:inline-block"></span> Planned / remaining</span>
      <span class="key"><span class="sw" style="background:var(--bar-critical);width:16px;height:10px;border-radius:3px;display:inline-block"></span> Critical</span>
      <span class="key"><span class="sw" style="background:var(--bar-done);width:16px;height:10px;border-radius:3px;display:inline-block"></span> Complete</span>
      <span class="key"><span class="sw" style="background:var(--bar-baseline);width:16px;height:4px;border-radius:2px;display:inline-block"></span> Baseline</span>
      <span class="key"><span style="display:inline-block;width:2px;height:12px;background:var(--s7)"></span> Data date ${date(bundle.project.dataDate)}</span>
      <span class="muted">Dark overlay on a bar = % complete. "A" = actual date.</span>
    </div>`;

  const draw = () => {
    const rows = buildRows(ctx);
    const hasBl = !!an.baseline;
    const columns = [
      { label: 'ID', w: '72px', render: (r) => (r.kind === 'wbs' ? `<span class="muted">${ui.collapsed.has(r.id) ? '▸' : '▾'}</span>` : `<span class="${r.critical ? 'crit-txt' : ''}">${esc(r.code)}</span>`) },
      { label: 'Activity name', w: 'minmax(120px,1fr)', render: (r) => `<span style="padding-left:${r.depth * 12}px">${r.kind === 'wbs' ? `<b>${esc(r.code ? `${r.code} ` : '')}</b>` : ''}${esc(r.name)}</span>` },
      { label: 'Dur', w: '38px', num: true, render: (r) => (r.kind === 'act' ? (isMilestone(r.a) ? '0' : r.a.type === 'loe' ? '—' : num(r.a.duration)) : '') },
      { label: 'Start', w: '90px', render: (r) => (r.start ? `${date(r.start)}${r.a?.actualStart ? ' A' : ''}` : '') },
      { label: 'Finish', w: '90px', render: (r) => (r.finish ? `${date(r.finish)}${r.a?.actualFinish ? ' A' : ''}` : '') },
      { label: 'TF', w: '38px', num: true, render: (r) => (r.kind === 'act' ? (r.r.tf === null ? '' : `<span class="${r.r.tf < 0 ? 'neg' : ''}">${r.r.tf}</span>`) : r.minTf !== null && r.minTf !== undefined ? `<span class="${r.minTf < 0 ? 'neg' : 'muted'}">${r.minTf}</span>` : '') },
      { label: '%', w: '36px', num: true, render: (r) => num(r.pct, 0) },
      ...(hasBl ? [{ label: 'Var', w: '40px', num: true, render: (r) => (r.variance === null || r.variance === undefined ? '' : `<span class="${r.variance > 5 ? 'neg' : 'muted'}">${signed(r.variance, '')}</span>`) }] : []),
    ];
    renderGantt(el.querySelector('#gantt'), {
      rows,
      columns,
      dataDate: bundle.project.dataDate,
      zoom: ui.zoom,
      showBaseline: ui.showBaseline,
      showLinks: ui.showLinks,
      relationships: bundle.relationships,
      selectedId: ui.selected,
      onSelect: (id) => {
        ui.selected = id;
        openActivity(ctx, id);
      },
      onToggle: (id) => {
        if (ui.collapsed.has(id)) ui.collapsed.delete(id);
        else ui.collapsed.add(id);
        draw();
      },
    });
  };
  draw();

  el.querySelector('#q').addEventListener('input', (e) => {
    ui.q = e.target.value;
    draw();
  });
  el.querySelector('#filter').onchange = (e) => {
    ui.filter = e.target.value;
    draw();
  };
  el.querySelector('#bl').onchange = (e) => {
    ui.showBaseline = e.target.checked;
    draw();
  };
  el.querySelector('#links').onchange = (e) => {
    ui.showLinks = e.target.checked;
    draw();
  };
  el.querySelectorAll('#zoom button').forEach((b) => (b.onclick = () => {
    ui.zoom = b.dataset.v;
    el.querySelectorAll('#zoom button').forEach((x) => x.classList.toggle('on', x === b));
    draw();
  }));
  el.querySelectorAll('#group button').forEach((b) => (b.onclick = () => {
    ui.group = b.dataset.v;
    el.querySelectorAll('#group button').forEach((x) => x.classList.toggle('on', x === b));
    draw();
  }));
  el.querySelector('#csv').onclick = () => exportCsv(ctx);
  if (canWrite) {
    el.querySelector('#addact').onclick = () => addActivity(ctx);
    el.querySelector('#addwbs').onclick = () => addWbs(ctx);
    el.querySelector('#progress').onclick = () => progressUpdate(ctx);
  }
}

function matches(ctx, a) {
  const { ui, an, bundle } = ctx;
  const r = an.sched.byId.get(a.id);
  const q = (ui.q || '').toLowerCase();
  if (q && !`${a.code} ${a.name}`.toLowerCase().includes(q)) return false;
  const dd = toDay(bundle.project.dataDate);
  switch (ui.filter) {
    case 'critical':
      return r.critical;
    case 'longest':
      return r.longest;
    case 'lookahead':
      return r.status !== 'complete' && r.es < dd + 21 && r.ef > dd;
    case 'progress':
      return r.status === 'in-progress';
    case 'open':
      return r.status !== 'complete';
    case 'behind':
      return (an.variance.get(a.id)?.finish ?? 0) > 5;
    case 'negative':
      return r.tf !== null && r.tf < 0;
    default:
      return true;
  }
}

function actRow(ctx, a, depth) {
  const r = ctx.an.sched.byId.get(a.id);
  const v = ctx.an.variance.get(a.id);
  const lv = ctx.ui.levelled?.byId.get(a.id);
  return {
    kind: 'act',
    id: a.id,
    depth,
    code: a.code,
    name: a.name,
    start: r.start,
    finish: r.finish,
    pct: ctx.an.evm.pctById.get(a.id) ?? a.pctComplete,
    critical: r.critical && r.status !== 'complete',
    a,
    r,
    blStart: v?.blStart,
    blFinish: v?.blFinish,
    variance: v?.finish,
    lvStart: lv?.start,
    lvFinish: lv?.finish,
  };
}

export function buildRows(ctx) {
  const { bundle, an, ui } = ctx;
  const acts = bundle.activities.filter((a) => matches(ctx, a));
  const byStart = (x, y) => an.sched.byId.get(x.id).es - an.sched.byId.get(y.id).es || String(x.code).localeCompare(String(y.code));
  if (ui.group === 'flat') return acts.sort(byStart).map((a) => actRow(ctx, a, 0));
  const kids = new Map();
  for (const w of bundle.wbs) {
    const k = w.parentId || null;
    if (!kids.has(k)) kids.set(k, []);
    kids.get(k).push(w);
  }
  const actsBy = new Map();
  for (const a of acts) {
    const k = a.wbsId || null;
    if (!actsBy.has(k)) actsBy.set(k, []);
    actsBy.get(k).push(a);
  }
  const has = new Map();
  const count = (wid) => {
    if (has.has(wid)) return has.get(wid);
    const n = (actsBy.get(wid) || []).length + (kids.get(wid) || []).reduce((s, w) => s + count(w.id), 0);
    has.set(wid, n);
    return n;
  };
  const filtered = ui.filter !== 'all' || ui.q;
  const rows = [];
  const walk = (parent, depth) => {
    for (const w of (kids.get(parent) || []).sort((x, y) => (x.sort ?? 0) - (y.sort ?? 0))) {
      if (filtered && !count(w.id)) continue;
      if (!filtered && !count(w.id) && !ui.showEmptyWbs) {
        /* still show empty WBS so users can add to it */
      }
      const s = an.rollup.get(w.id);
      rows.push({ kind: 'wbs', id: w.id, depth, code: w.code, name: w.name, start: s?.start, finish: s?.finish, pct: s?.pct, minTf: s?.minTf });
      if (ui.collapsed.has(w.id)) continue;
      walk(w.id, depth + 1);
    }
    for (const a of (actsBy.get(parent) || []).sort(byStart)) rows.push(actRow(ctx, a, depth));
  };
  walk(null, 0);
  return rows;
}

// ---- activity drawer --------------------------------------------------------
export function openActivity(ctx, id) {
  const { bundle, an, app } = ctx;
  const a = bundle.activities.find((x) => x.id === id);
  if (!a) return;
  const r = an.sched.byId.get(id);
  const canWrite = app.can('write');
  const dis = canWrite ? '' : 'disabled';
  const actById = ctx.acts;
  const preds = bundle.relationships.filter((x) => x.succId === id);
  const succs = bundle.relationships.filter((x) => x.predId === id);
  const asg = bundle.assignments.filter((x) => x.activityId === id);
  const budget = an.evm.budgets.get(id);
  const actualH = an.entries.filter((e) => e.activityId === id).reduce((s, e) => s + e.hours, 0);
  const crit = an.sched.byId.get(id).critical;
  const drivingText = r.driving
    ?.map((d) => (d === 'constraint' ? `its ${CONSTRAINTS[a.constraintType] || 'constraint'} (${date(a.constraintDate)})` : (() => {
      const rel = bundle.relationships.find((x) => x.id === d);
      const p = rel && actById.get(rel.predId);
      return p ? `${p.code} ${p.name} (${rel.type}${rel.lag ? (rel.lag > 0 ? '+' : '') + rel.lag : ''})` : null;
    })()))
    .filter(Boolean);
  const wbsOpts = [['', '— none —'], ...bundle.wbs.map((w) => [w.id, `${w.code || ''} ${w.name}`])];
  const calOpts = [['', 'Project default'], ...app.boot.calendars.map((c) => [c.id, c.name])];
  const sel = (name, opts, v) => `<select name="${name}" ${dis}>${opts.map(([k, l]) => `<option value="${esc(k)}" ${String(v ?? '') === String(k) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const inp = (name, v, type = 'text', extra = '') => `<input name="${name}" type="${type}" value="${esc(v ?? '')}" ${dis} ${extra}>`;
  const actOptions = bundle.activities.filter((x) => x.id !== id).sort((x, y) => String(x.code).localeCompare(String(y.code)));

  const body = `
    <div class="kpis" style="grid-template-columns:repeat(4,1fr);margin-bottom:14px">
      <div class="kpi"><div class="label">Start</div><div class="value" style="font-size:15px">${date(r.start)}${a.actualStart ? ' A' : ''}</div></div>
      <div class="kpi"><div class="label">Finish</div><div class="value" style="font-size:15px">${date(r.finish)}${a.actualFinish ? ' A' : ''}</div></div>
      <div class="kpi"><div class="label">Total float</div><div class="value" style="font-size:15px;${r.tf < 0 ? 'color:var(--critical-ink)' : ''}">${r.tf ?? '—'}${r.tf !== null ? 'd' : ''}</div></div>
      <div class="kpi"><div class="label">Free float</div><div class="value" style="font-size:15px">${r.ff ?? '—'}${r.ff !== null ? 'd' : ''}</div></div>
    </div>
    ${r.status !== 'complete' ? `<div class="callout small" style="margin-bottom:14px"><b>Why these dates?</b> ${drivingText?.length ? `Driven by ${drivingText.map(esc).join(' and ')}.` : r.status === 'in-progress' ? 'In progress — remaining work is scheduled from the data date.' : 'Not driven by logic — starts at the data date / project start. Consider adding a predecessor.'} Late dates ${date(r.lateStart)} → ${date(r.lateFinish)}.${crit ? ' <b>On the critical path.</b>' : ''}</div>` : ''}
    <form id="actform" class="stack">
      <div class="form-grid">
        <label class="field">Activity ID${inp('code', a.code)}</label>
        <label class="field">Type${sel('type', Object.entries(TYPES), a.type)}</label>
        <label class="field full">Name${inp('name', a.name)}</label>
        <label class="field">WBS${sel('wbsId', wbsOpts, a.wbsId)}</label>
        <label class="field">Phase${sel('phase', Object.entries(PHASES), a.phase)}</label>
        <label class="field">Original duration (working days)${inp('duration', a.duration, 'number', 'min="0" step="1"')}</label>
        <label class="field">Calendar${sel('calendarId', calOpts, a.calendarId)}</label>
        <label class="field">Constraint${sel('constraintType', Object.entries(CONSTRAINTS), a.constraintType)}</label>
        <label class="field">Constraint date${inp('constraintDate', a.constraintDate, 'date')}</label>
        <label class="field">Discipline${inp('discipline', a.discipline)}</label>
        <label class="field">Area / system${inp('system', a.system)}</label>
      </div>
      <h3>Progress</h3>
      <div class="form-grid">
        <label class="field">Actual start${inp('actualStart', a.actualStart, 'date')}</label>
        <label class="field">Actual finish${inp('actualFinish', a.actualFinish, 'date')}</label>
        <label class="field">Progress method${sel('progressMethod', Object.entries(PROGRESS_METHODS), a.progressMethod || 'physical')}</label>
        <label class="field">Physical % complete${inp('pctComplete', a.pctComplete, 'number', 'min="0" max="100" step="1"')}</label>
        <label class="field">Remaining duration (days)${inp('remaining', a.remaining ?? (r.status === 'in-progress' ? r.remaining : ''), 'number', 'min="0" step="1"')}</label>
        <label class="field">Earned % (used for EV)<input value="${pct(an.evm.pctById.get(id), 1)}" disabled></label>
      </div>
      <div id="steps"></div>
      <h3>Cost & risk estimate</h3>
      <div class="form-grid">
        <label class="field">Non-labour budget${inp('budgetCost', a.budgetCost, 'number', 'step="any"')}</label>
        <label class="field">Non-labour actual cost${inp('actualCost', a.actualCost, 'number', 'step="any"')}</label>
        <label class="field">Optimistic duration <span class="hint">(QSRA)</span>${inp('optimistic', a.optimistic, 'number', 'min="0"')}</label>
        <label class="field">Pessimistic duration <span class="hint">(QSRA)</span>${inp('pessimistic', a.pessimistic, 'number', 'min="0"')}</label>
        <label class="field full">Notes<textarea name="notes" rows="2" ${dis}>${esc(a.notes || '')}</textarea></label>
      </div>
    </form>
    <h3 style="margin-top:18px">Predecessors</h3>
    ${relTable(preds, 'predId', actById, canWrite)}
    <h3 style="margin-top:14px">Successors</h3>
    ${relTable(succs, 'succId', actById, canWrite)}
    ${canWrite ? `<div class="row" style="margin-top:8px"><select id="relact" style="flex:1;min-width:180px">${actOptions.map((x) => `<option value="${esc(x.id)}">${esc(x.code)} — ${esc(x.name)}</option>`).join('')}</select><select id="reldir"><option value="pred">is a predecessor</option><option value="succ">is a successor</option></select><select id="reltype"><option>FS</option><option>SS</option><option>FF</option><option>SF</option></select><input id="rellag" type="number" value="0" style="width:64px" title="Lag (working days)"><button class="btn" id="addrel">Add</button></div>` : ''}
    <h3 style="margin-top:18px">Resources</h3>
    <div class="table-wrap"><table class="data"><thead><tr><th>Resource</th><th class="num">Budget h</th><th class="num">Rate</th><th class="num">Cost</th>${canWrite ? '<th></th>' : ''}</tr></thead><tbody>
      ${asg.map((s) => {
        const res = app.resource(s.resourceId);
        return `<tr><td>${esc(res?.name || s.resourceId)}</td><td class="num">${canWrite ? `<input type="number" data-asg="${esc(s.id)}" value="${esc(s.budgetHours)}" style="width:80px;text-align:right">` : num(s.budgetHours)}</td><td class="num">${money(res?.rate)}</td><td class="num">${money((res?.rate || 0) * s.budgetHours)}</td>${canWrite ? `<td><button class="btn ghost sm danger" data-delasg="${esc(s.id)}">Remove</button></td>` : ''}</tr>`;
      }).join('') || `<tr><td colspan="5" class="muted">No resources assigned</td></tr>`}
    </tbody></table></div>
    <div class="muted small" style="margin-top:6px">Budget ${num(budget?.hours)} h · ${money(budget?.total)} total · ${num(actualH, 1)} h booked on approved timesheets</div>
    ${canWrite ? `<div class="row" style="margin-top:8px"><select id="asgres" style="flex:1">${app.boot.resources.filter((x) => x.active !== false).map((x) => `<option value="${esc(x.id)}">${esc(x.code)} — ${esc(x.name)}</option>`).join('')}</select><input id="asghours" type="number" placeholder="hours" style="width:90px"><button class="btn" id="addasg">Assign</button></div>` : ''}
  `;
  const footer = canWrite ? `<button class="btn primary" id="save">Save changes</button><button class="btn danger" id="del">Delete</button><span class="right muted small">${esc(r.status)}</span>` : '';
  drawer({
    title: `${a.code} · ${a.name}`,
    subtitle: `${esc(TYPES[a.type] || a.type)} · ${esc(activityStatus(a))}${crit ? ' · <b style="color:var(--critical-ink)">critical</b>' : ''}`,
    body,
    footer,
    onMount: (d) => wireActivityDrawer(ctx, d, a),
    onClose: () => {
      ctx.ui.selected = null;
    },
  });
}

function relTable(list, key, actById, canWrite) {
  if (!list.length) return '<div class="muted small">None</div>';
  return `<div class="table-wrap"><table class="data"><tbody>${list
    .map((rel) => {
      const o = actById.get(rel[key]);
      return `<tr><td><a href="#" data-goto="${esc(rel[key])}">${esc(o?.code)}</a> ${esc(o?.name)}</td><td class="nowrap">${esc(rel.type)}${rel.lag ? ` ${rel.lag > 0 ? '+' : ''}${rel.lag}d` : ''}</td>${canWrite ? `<td class="num"><button class="btn ghost sm danger" data-delrel="${esc(rel.id)}">Remove</button></td>` : ''}</tr>`;
    })
    .join('')}</tbody></table></div>`;
}

function wireActivityDrawer(ctx, d, a) {
  const { app, bundle } = ctx;
  const after = async (msg) => {
    if (msg) toast(msg);
    await ctx.reload();
    openActivity(ctx, a.id);
  };
  // steps editor
  const stepsHost = d.querySelector('#steps');
  const steps = structuredClone(a.steps || []);
  const drawSteps = () => {
    const method = d.querySelector('[name=progressMethod]').value;
    if (method !== 'steps') {
      stepsHost.innerHTML = '';
      return;
    }
    stepsHost.innerHTML = `<h4 style="margin:12px 0 6px">Steps / rules of credit <span class="muted small">— ${pct(stepsPercent({ steps }), 0)} earned</span></h4>
      <table class="data"><thead><tr><th>Step</th><th class="num">Weight</th><th>Done</th><th></th></tr></thead><tbody>
      ${steps.map((s, i) => `<tr><td><input data-sn="${i}" value="${esc(s.name)}" style="width:100%"></td><td class="num"><input data-sw="${i}" type="number" value="${esc(s.weight)}" style="width:70px"></td><td><input type="checkbox" data-sd="${i}" ${s.done ? 'checked' : ''}></td><td><button class="btn ghost sm" data-sx="${i}">✕</button></td></tr>`).join('')}
      </tbody></table><button class="btn sm" id="addstep" style="margin-top:6px">${icons.plus} Step</button>`;
    stepsHost.querySelectorAll('[data-sn]').forEach((x) => (x.oninput = () => (steps[x.dataset.sn].name = x.value)));
    stepsHost.querySelectorAll('[data-sw]').forEach((x) => (x.oninput = () => (steps[x.dataset.sw].weight = Number(x.value))));
    stepsHost.querySelectorAll('[data-sd]').forEach((x) => (x.onchange = () => {
      steps[x.dataset.sd].done = x.checked;
      drawSteps();
    }));
    stepsHost.querySelectorAll('[data-sx]').forEach((x) => (x.onclick = (e) => {
      e.preventDefault();
      steps.splice(Number(x.dataset.sx), 1);
      drawSteps();
    }));
    stepsHost.querySelector('#addstep').onclick = (e) => {
      e.preventDefault();
      steps.push({ name: 'New step', weight: 10, done: false });
      drawSteps();
    };
  };
  d.querySelector('[name=progressMethod]').addEventListener('change', drawSteps);
  drawSteps();

  d.querySelectorAll('[data-goto]').forEach((x) => (x.onclick = (e) => {
    e.preventDefault();
    openActivity(ctx, x.dataset.goto);
  }));
  if (!app.can('write')) return;

  d.querySelector('#save').onclick = async () => {
    const f = d.querySelector('#actform');
    const val = (n) => f.querySelector(`[name=${n}]`).value;
    const numOrNull = (n) => (val(n) === '' ? null : Number(val(n)));
    const body = {
      code: val('code'), name: val('name'), type: val('type'), wbsId: val('wbsId') || null, phase: val('phase'), duration: numOrNull('duration') ?? 0,
      calendarId: val('calendarId') || null, constraintType: val('constraintType'), constraintDate: val('constraintDate') || null,
      discipline: val('discipline'), system: val('system'), actualStart: val('actualStart') || null, actualFinish: val('actualFinish') || null,
      progressMethod: val('progressMethod'), pctComplete: numOrNull('pctComplete') ?? 0, remaining: numOrNull('remaining'),
      budgetCost: numOrNull('budgetCost') ?? 0, actualCost: numOrNull('actualCost') ?? 0, optimistic: numOrNull('optimistic'), pessimistic: numOrNull('pessimistic'), notes: val('notes'),
      steps,
    };
    if (!body.constraintType) body.constraintDate = null;
    if (body.progressMethod === 'steps' && steps.length) body.pctComplete = Math.round(stepsPercent({ steps }));
    try {
      await app.api.put(`activities/${a.id}`, body);
      await after('Activity saved — schedule recalculated');
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  d.querySelector('#del').onclick = async () => {
    if (!(await confirmDialog('Delete activity', `Delete ${a.code} ${a.name}? Its relationships and resource assignments are removed too.`, { danger: true, ok: 'Delete' }))) return;
    await app.api.del(`activities/${a.id}`);
    closeDrawer();
    toast('Activity deleted');
    ctx.reload();
  };
  d.querySelectorAll('[data-delrel]').forEach((b) => (b.onclick = async () => {
    await app.api.del(`relationships/${b.dataset.delrel}`);
    await after('Relationship removed');
  }));
  d.querySelector('#addrel').onclick = async () => {
    const other = d.querySelector('#relact').value;
    const dir = d.querySelector('#reldir').value;
    try {
      await app.api.post('relationships', {
        projectId: bundle.project.id,
        predId: dir === 'pred' ? other : a.id,
        succId: dir === 'pred' ? a.id : other,
        type: d.querySelector('#reltype').value,
        lag: Number(d.querySelector('#rellag').value || 0),
      });
      await after('Relationship added');
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  d.querySelectorAll('[data-delasg]').forEach((b) => (b.onclick = async () => {
    await app.api.del(`assignments/${b.dataset.delasg}`);
    await after('Resource removed');
  }));
  d.querySelectorAll('[data-asg]').forEach((inp) => (inp.onchange = async () => {
    await app.api.put(`assignments/${inp.dataset.asg}`, { budgetHours: Number(inp.value || 0) });
    await after('Budget hours updated');
  }));
  d.querySelector('#addasg').onclick = async () => {
    try {
      await app.api.post('assignments', { projectId: bundle.project.id, activityId: a.id, resourceId: d.querySelector('#asgres').value, budgetHours: Number(d.querySelector('#asghours').value || 0) });
      await after('Resource assigned');
    } catch (e) {
      toast(e.message, 'error');
    }
  };
}

async function addActivity(ctx) {
  const { bundle, app, ui } = ctx;
  const sel = ui.selected && bundle.activities.find((x) => x.id === ui.selected);
  const r = await formDialog({
    title: 'Add activity',
    fields: [
      { name: 'name', label: 'Name', required: true, full: true },
      { name: 'code', label: 'Activity ID', hint: '(blank = auto)' },
      { name: 'type', label: 'Type', type: 'select', options: Object.entries(TYPES) },
      { name: 'wbsId', label: 'WBS', type: 'select', options: [['', '— none —'], ...bundle.wbs.map((w) => [w.id, `${w.code || ''} ${w.name}`])] },
      { name: 'duration', label: 'Duration (working days)', type: 'number', default: 5 },
      { name: 'phase', label: 'Phase', type: 'select', options: Object.entries(PHASES) },
      { name: 'pred', label: 'Predecessor (FS)', type: 'select', options: [['', '— none —'], ...bundle.activities.map((x) => [x.id, `${x.code} — ${x.name}`])] },
    ],
    values: { wbsId: sel?.wbsId || '', pred: sel?.id || '', type: 'task', phase: sel?.phase || '' },
    submitLabel: 'Add',
    onSubmit: async (d) => {
      const { pred, ...body } = d;
      const act = await app.api.post('activities', { ...body, projectId: bundle.project.id, wbsId: body.wbsId || null, duration: body.type.includes('milestone') ? 0 : body.duration ?? 5 });
      if (pred) await app.api.post('relationships', { projectId: bundle.project.id, predId: pred, succId: act.id, type: 'FS', lag: 0 });
      return act;
    },
  });
  if (r) {
    ui.selected = r.id;
    await ctx.reload();
    openActivity(ctx, r.id);
  }
}

async function addWbs(ctx) {
  const { bundle, app } = ctx;
  const r = await formDialog({
    title: 'Add WBS element',
    fields: [
      { name: 'code', label: 'WBS code' },
      { name: 'name', label: 'Name', required: true },
      { name: 'parentId', label: 'Parent', type: 'select', options: [['', '— top level —'], ...bundle.wbs.map((w) => [w.id, `${w.code || ''} ${w.name}`])], full: true },
    ],
    onSubmit: (d) => app.api.post('wbs', { ...d, projectId: bundle.project.id, parentId: d.parentId || null, sort: bundle.wbs.length }),
  });
  if (r) ctx.reload();
}

/** Weekly progress sheet: everything in progress or due to start in the next 2 weeks. */
async function progressUpdate(ctx) {
  const { bundle, an, app } = ctx;
  const dd = toDay(bundle.project.dataDate);
  const list = bundle.activities
    .filter((a) => {
      const r = an.sched.byId.get(a.id);
      return r.status === 'in-progress' || (r.status === 'not-started' && r.es < dd + 14 && a.type !== 'loe');
    })
    .sort((x, y) => an.sched.byId.get(x.id).es - an.sched.byId.get(y.id).es);
  const res = await modal({
    title: `Progress update — data date ${date(bundle.project.dataDate)}`,
    wide: true,
    body: list.length
      ? `<p class="muted small">Record actual dates, % complete and remaining duration for work in progress or due to start. Steps-based activities are updated in their own panel.</p>
      <div class="table-wrap tall"><table class="data"><thead><tr><th>Activity</th><th>Actual start</th><th>Actual finish</th><th class="num">% complete</th><th class="num">Remaining d</th></tr></thead><tbody>
      ${list.map((a) => {
        const r = an.sched.byId.get(a.id);
        const steps = a.progressMethod === 'steps' || a.progressMethod === 'register';
        return `<tr data-id="${esc(a.id)}"><td><b>${esc(a.code)}</b> ${esc(a.name)}<div class="muted small">${date(r.start)} → ${date(r.finish)}${r.critical ? ' · critical' : ''}</div></td>
          <td><input type="date" name="actualStart" value="${esc(a.actualStart || '')}"></td>
          <td><input type="date" name="actualFinish" value="${esc(a.actualFinish || '')}"></td>
          <td class="num"><input type="number" name="pctComplete" min="0" max="100" value="${esc(a.pctComplete || 0)}" style="width:70px" ${steps ? 'disabled title="Driven by steps / register"' : ''}></td>
          <td class="num"><input type="number" name="remaining" min="0" value="${esc(a.remaining ?? (r.status === 'in-progress' ? r.remaining : a.duration))}" style="width:70px"></td></tr>`;
      }).join('')}
      </tbody></table></div>`
      : '<div class="empty">Nothing in progress or due to start in the next two weeks.</div>',
    actions: [
      { label: 'Cancel', value: null },
      {
        label: 'Save progress',
        primary: true,
        handler: async (root) => {
          const ops = [];
          root.querySelectorAll('tr[data-id]').forEach((tr) => {
            const a = bundle.activities.find((x) => x.id === tr.dataset.id);
            const v = (n) => tr.querySelector(`[name=${n}]`).value;
            const body = { actualStart: v('actualStart') || null, actualFinish: v('actualFinish') || null, remaining: v('remaining') === '' ? null : Number(v('remaining')) };
            if (!tr.querySelector('[name=pctComplete]').disabled) body.pctComplete = Number(v('pctComplete') || 0);
            const changed = body.actualStart !== (a.actualStart || null) || body.actualFinish !== (a.actualFinish || null) || (body.pctComplete !== undefined && body.pctComplete !== Number(a.pctComplete || 0)) || (body.remaining !== null && body.remaining !== a.remaining);
            if (changed) ops.push({ method: 'PUT', path: `activities/${a.id}`, body });
          });
          if (ops.length) await app.api.post('batch', { ops });
          return ops.length;
        },
      },
    ],
  });
  if (res !== null && res !== undefined) {
    toast(`${res} activities updated — schedule recalculated`);
    ctx.reload();
  }
}

function exportCsv(ctx) {
  const { bundle, an } = ctx;
  const wbs = new Map(bundle.wbs.map((w) => [w.id, w]));
  const rows = bundle.activities.map((a) => ({ a, r: an.sched.byId.get(a.id), v: an.variance.get(a.id) }));
  const csv = toCsv(rows, [
    { label: 'Activity ID', value: (x) => x.a.code },
    { label: 'Activity name', value: (x) => x.a.name },
    { label: 'WBS', value: (x) => wbs.get(x.a.wbsId)?.code || '' },
    { label: 'Type', value: (x) => x.a.type },
    { label: 'Original duration', value: (x) => x.a.duration },
    { label: 'Remaining duration', value: (x) => x.r.remaining },
    { label: 'Start', value: (x) => x.r.start },
    { label: 'Finish', value: (x) => x.r.finish },
    { label: 'Actual start', value: (x) => x.a.actualStart || '' },
    { label: 'Actual finish', value: (x) => x.a.actualFinish || '' },
    { label: 'Late start', value: (x) => x.r.lateStart },
    { label: 'Late finish', value: (x) => x.r.lateFinish },
    { label: 'Total float', value: (x) => x.r.tf ?? '' },
    { label: 'Free float', value: (x) => x.r.ff ?? '' },
    { label: 'Critical', value: (x) => (x.r.critical ? 'Y' : 'N') },
    { label: '% complete', value: (x) => Math.round(an.evm.pctById.get(x.a.id) ?? 0) },
    { label: 'Baseline start', value: (x) => x.v?.blStart || '' },
    { label: 'Baseline finish', value: (x) => x.v?.blFinish || '' },
    { label: 'Finish variance (d)', value: (x) => x.v?.finish ?? '' },
    { label: 'Budget cost', value: (x) => Math.round(an.evm.budgets.get(x.a.id)?.total || 0) },
  ]);
  download(`${bundle.project.code}-schedule-${bundle.project.dataDate}.csv`, csv, 'text/csv');
}
