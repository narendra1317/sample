import { esc, num, money, formDialog, toast, icons, tableHtml, makeSortable, bindTips, confirmDialog } from '../ui.js';
import { utilColor, utilInk } from '../charts.js';
import { addDays, weekStart, todayIso, fmtDate } from '../../core/dates.js';

const ui = { from: null, weeks: 16, discipline: '', mode: 'util' };

export async function render(el, route, app, { title, actions }) {
  title.innerHTML = '<h1>Resources</h1><div class="muted small">Company-wide pool and week-by-week utilisation across every project</div>';
  if (app.can('write')) {
    actions.innerHTML = `<button class="btn primary" id="addres">${icons.plus} Resource</button>`;
    actions.querySelector('#addres').onclick = () => editResource(app, null);
  }
  const tab = route.tab === 'pool' ? 'pool' : 'utilisation';
  el.innerHTML = `<div class="tabs"><a href="#/resources/utilisation" class="${tab === 'utilisation' ? 'active' : ''}">Utilisation</a><a href="#/resources/pool" class="${tab === 'pool' ? 'active' : ''}">Resource pool</a></div><div id="rbody"></div>`;
  const host = el.querySelector('#rbody');
  if (tab === 'pool') return pool(host, app);
  return utilisation(host, app);
}

async function utilisation(el, app) {
  ui.from = ui.from || addDays(weekStart(todayIso()), -28);
  const data = await app.api.get('utilisation', { from: ui.from, weeks: ui.weeks, discipline: ui.discipline });
  const disciplines = [...new Set(app.boot.resources.map((r) => r.discipline).filter(Boolean))].sort();
  const thisWeek = weekStart(todayIso());
  const projCode = (id) => app.project(id)?.code || id;
  const over = data.rows.flatMap((r) => r.cells.filter((c) => c.util > 1.05 && c.week >= thisWeek).map((c) => ({ r, c })));
  const idle = data.rows.filter((r) => r.cells.filter((c) => c.week >= thisWeek).slice(0, 4).every((c) => c.util < 0.3));

  el.innerHTML = `<div class="stack">
    <div class="card"><div class="row">
      <label class="field">From week<input type="date" id="from" value="${esc(ui.from)}"></label>
      <label class="field">Weeks<select id="weeks">${[8, 12, 16, 26, 52].map((w) => `<option ${w === ui.weeks ? 'selected' : ''}>${w}</option>`).join('')}</select></label>
      <label class="field">Discipline<select id="disc"><option value="">All</option>${disciplines.map((d) => `<option ${d === ui.discipline ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></label>
      <label class="field">Show<select id="mode"><option value="util" ${ui.mode === 'util' ? 'selected' : ''}>Utilisation %</option><option value="hours" ${ui.mode === 'hours' ? 'selected' : ''}>Hours</option></select></label>
    </div></div>
    <div class="grid g2">
      <div class="card"><div class="muted small">Over-allocated resource-weeks ahead</div><div class="hero" style="color:${over.length ? 'var(--critical-ink)' : 'inherit'}">${over.length}</div><div class="muted small">${over.slice(0, 4).map((o) => `${esc(o.r.resource.name.split(' — ')[0])} w/c ${fmtDate(o.c.week).slice(0, 6)} (${Math.round(o.c.util * 100)}%)`).join(' · ')}</div></div>
      <div class="card"><div class="muted small">Under-used next 4 weeks (&lt; 30%)</div><div class="hero">${idle.length}</div><div class="muted small">${idle.slice(0, 5).map((r) => esc(r.resource.name.split(' — ')[0])).join(' · ') || 'None'} — candidates for bids or reallocation</div></div>
    </div>
    <div class="card"><header><h3>Utilisation heatmap</h3><span class="muted small">Past weeks = timesheet actuals (approved + submitted) · future weeks = remaining forecast from live schedules</span></header>
      <div class="table-wrap"><table class="heat"><thead><tr><th></th>${data.weeks.map((w) => `<th class="${w === thisWeek ? 'label-strong' : ''}" style="${w === thisWeek ? 'color:var(--ink)' : ''}">${fmtDate(w).slice(0, 6)}</th>`).join('')}<th>Total h</th></tr></thead><tbody>
      ${data.rows.map((row) => `<tr><td class="name" title="${esc(row.resource.name)}">${esc(row.resource.name)}<div class="muted small">${esc(row.resource.discipline || '')} · ${num(row.cells[0]?.capacity)} h/wk</div></td>${row.cells.map((c) => {
        const load = c.actual + c.submitted > 0 ? c.actual + c.submitted : c.planned;
        const split = data.split[`${row.resource.id}|${c.week}`] || {};
        const tip = `<div class="v">${esc(row.resource.name)}</div><div class="k">w/c ${esc(fmtDate(c.week))}</div><div><b>${num(load, 1)} h</b> of ${num(c.capacity)} h (${Math.round(c.util * 100)}%)</div>${c.actual ? `<div class="k">Approved ${num(c.actual, 1)} h</div>` : ''}${c.submitted ? `<div class="k">Awaiting approval ${num(c.submitted, 1)} h</div>` : ''}${Object.entries(split).map(([pid, h]) => `<div class="k">Forecast ${esc(projCode(pid))}: ${num(h, 1)} h</div>`).join('')}`;
        const text = ui.mode === 'hours' ? (load ? num(load) : '') : load ? `${Math.round(c.util * 100)}` : '';
        return `<td class="cell ${c.util > 1.05 ? 'over' : ''}" style="background:${utilColor(Math.min(c.util, 1))};color:${utilInk(Math.min(c.util, 1))}" data-tip="${esc(tip)}" tabindex="0">${text}${c.util > 1.05 ? '!' : ''}</td>`;
      }).join('')}<td class="num small">${num(row.cells.reduce((s, c) => s + (c.actual + c.submitted > 0 ? c.actual + c.submitted : c.planned), 0))}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="legend"><span class="key"><span class="sw" style="background:var(--seq-100)"></span>&lt;25%</span><span class="key"><span class="sw" style="background:var(--seq-200)"></span>25–50%</span><span class="key"><span class="sw" style="background:var(--seq-300)"></span>50–75%</span><span class="key"><span class="sw" style="background:var(--seq-400)"></span>75–90%</span><span class="key"><span class="sw" style="background:var(--seq-500)"></span>90–100%+</span><span class="key"><span class="sw" style="box-shadow:inset 0 0 0 2px var(--critical)"></span>! Over capacity</span></div>
    </div>
  </div>`;
  bindTips(el);
  const set = (id, k, cast = (v) => v) => (el.querySelector(id).onchange = (e) => {
    ui[k] = cast(e.target.value);
    utilisation(el, app);
  });
  set('#from', 'from', (v) => weekStart(v));
  set('#weeks', 'weeks', Number);
  set('#disc', 'discipline');
  set('#mode', 'mode');
}

async function pool(el, app) {
  const rows = [...app.boot.resources].sort((a, b) => a.code.localeCompare(b.code));
  const users = new Map(app.boot.users.filter((u) => u.resourceId).map((u) => [u.resourceId, u]));
  el.innerHTML = `<div class="card flush">${tableHtml(rows, [
    { label: 'Code', render: (r) => `<b>${esc(r.code)}</b>` },
    { label: 'Name', render: (r) => `${esc(r.name)}${r.active === false ? ' <span class="pill">inactive</span>' : ''}<div class="muted small">${esc(r.company || '')}</div>` },
    { label: 'Type', render: (r) => esc(r.type) },
    { label: 'Discipline', render: (r) => esc(r.discipline || '') },
    { label: 'Rate / h', num: true, render: (r) => money(r.rate) },
    { label: 'Max h/day', num: true, render: (r) => num(r.maxHoursPerDay) },
    { label: 'Capacity h/wk', num: true, render: (r) => num(r.capacityHoursPerWeek || (r.maxHoursPerDay ? Math.min(r.maxHoursPerDay, 8) * 5 : 40)) },
    { label: 'Rotation', render: (r) => esc(r.rotation && r.rotation !== 'none' ? r.rotation : '—') },
    { label: 'Login', render: (r) => (users.get(r.id) ? esc(users.get(r.id).email) : '<span class="muted small">—</span>') },
  ], { rowAttrs: (r) => `class="clickable" data-id="${esc(r.id)}"` })}</div>`;
  makeSortable(el);
  if (app.can('write')) el.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => editResource(app, app.resource(tr.dataset.id))));
}

export async function editResource(app, res) {
  const fields = [
    { name: 'code', label: 'Code', required: true },
    { name: 'name', label: 'Name / role', required: true },
    { name: 'type', label: 'Type', type: 'select', options: [['labour', 'Labour'], ['equipment', 'Equipment'], ['material', 'Material']] },
    { name: 'discipline', label: 'Discipline' },
    { name: 'company', label: 'Company / supplier' },
    { name: 'email', label: 'Email' },
    { name: 'rate', label: 'Cost rate per hour', type: 'number', step: 'any' },
    { name: 'maxHoursPerDay', label: 'Max hours per day (levelling limit)', type: 'number', step: 'any' },
    { name: 'capacityHoursPerWeek', label: 'Capacity hours per week', type: 'number', step: 'any', hint: '(blank = calendar)' },
    { name: 'calendarId', label: 'Calendar', type: 'select', options: app.boot.calendars.map((c) => [c.id, c.name]) },
    { name: 'rotation', label: 'Rotation', type: 'select', options: [['none', 'Onshore / office'], ['2/2', 'Offshore 2 on / 2 off'], ['2/3', 'Offshore 2 on / 3 off'], ['3/3', 'Offshore 3 on / 3 off']] },
    { name: 'wtrOptOut', label: 'Signed 48h WTR opt-out', type: 'checkbox' },
    { name: 'active', label: 'Active', type: 'checkbox' },
  ];
  const r = await formDialog({
    title: res ? `Edit ${res.code}` : 'New resource',
    wide: true,
    fields,
    values: res || { type: 'labour', calendarId: 'default', rotation: 'none', active: true, maxHoursPerDay: 8 },
    extraHtml: res ? '<div style="margin-top:12px"><button type="button" class="btn danger sm" id="delres">Delete resource</button></div>' : '',
    onMount: (root, close) => {
      root.querySelector('#delres')?.addEventListener('click', async () => {
        if (!(await confirmDialog('Delete resource', `Delete ${res.name}? Their assignments are removed.`, { danger: true, ok: 'Delete' }))) return;
        try {
          await app.api.del(`resources/${res.id}`);
          close('deleted');
        } catch (e) {
          toast(e.message, 'error');
        }
      });
    },
    onSubmit: (d) => (res ? app.api.put(`resources/${res.id}`, d) : app.api.post('resources', d)),
  });
  if (r) {
    toast(r === 'deleted' ? 'Resource deleted' : 'Resource saved');
    await app.refreshBoot();
    app.rerender();
  }
}
