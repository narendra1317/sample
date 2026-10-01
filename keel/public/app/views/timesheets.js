import { esc, date, num, money, toast, modal, icons, download, rag } from '../ui.js';
import { columnChart } from '../charts.js';
import { addDays, weekStart, todayIso, fmtDate, toDay, fromDay } from '../../core/dates.js';
import { timesheetFlags } from '../../core/resources.js';
import { toCsv } from '../../core/mspxml.js';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CATEGORIES = [['overhead', 'Office overhead'], ['leave', 'Annual leave'], ['sick', 'Sickness'], ['training', 'Training'], ['bid', 'Bid / proposal'], ['travel', 'Travel (non-chargeable)']];
const ui = { week: null, resourceId: null, from: null, to: null, group: 'resource', projectId: '', include: 'approved,submitted' };

export async function render(el, route, app, { title, actions }) {
  const tabs = [['mine', 'My timesheet'], ...(app.can('approve') ? [['approvals', 'Approvals']] : []), ['reports', 'Hours reports']];
  title.innerHTML = '<h1>Timesheets</h1><div class="muted small">Weekly time booking against schedule activities — drives actual cost, actual starts and progress</div>';
  el.innerHTML = `<div class="tabs">${tabs.map(([k, l]) => `<a href="#/timesheet/${k}" class="${route.tab === k ? 'active' : ''}">${l}</a>`).join('')}</div><div id="ts"></div>`;
  const host = el.querySelector('#ts');
  if (route.tab === 'approvals' && app.can('approve')) return approvals(host, app);
  if (route.tab === 'reports') return reports(host, app, actions);
  return mine(host, app, route);
}

// ---- my timesheet --------------------------------------------------------------
async function mine(el, app, route) {
  const approver = app.can('approve') || app.user.role === 'admin';
  ui.resourceId = ui.resourceId || app.user.resourceId || (approver ? app.boot.resources.find((r) => r.type === 'labour')?.id : null);
  if (!ui.resourceId) {
    el.innerHTML = '<div class="card empty">Your user account is not linked to a resource yet. Ask an administrator to link it under Administration → Users.</div>';
    return;
  }
  ui.week = route.week || ui.week || weekStart(todayIso());
  const [ts, options] = await Promise.all([app.api.get('timesheets', { resourceId: ui.resourceId, weekStart: ui.week }), app.api.get('timesheets/options', { resourceId: ui.resourceId })]);
  const resource = app.resource(ui.resourceId);
  const editable = ['draft', 'rejected'].includes(ts.status) && (app.user.resourceId === ui.resourceId || approver);
  const lines = structuredClone(ts.lines || []);
  const projById = new Map(options.map((p) => [p.id, p]));
  const dis = editable ? '' : 'disabled';

  const lineRow = (l, i) => {
    const proj = l.projectId ? projById.get(l.projectId) : null;
    const actSel = proj
      ? `<select data-k="activityId" data-i="${i}" ${dis} style="max-width:300px"><option value="">— choose activity —</option>${proj.activities.filter((a) => !a.complete || a.id === l.activityId).map((a) => `<option value="${esc(a.id)}" ${a.id === l.activityId ? 'selected' : ''}>${a.assigned ? '★ ' : ''}${esc(a.code)} ${esc(a.name)}</option>`).join('')}</select>`
      : `<select data-k="category" data-i="${i}" ${dis}>${CATEGORIES.map(([k, v]) => `<option value="${k}" ${k === l.category ? 'selected' : ''}>${v}</option>`).join('')}</select>`;
    const act = proj?.activities.find((a) => a.id === l.activityId);
    const claimable = act && ['physical', 'duration'].includes(act.progressMethod || 'physical');
    return `<tr>
      <td class="l"><select data-k="projectId" data-i="${i}" ${dis}><option value="">Non-project time</option>${options.map((p) => `<option value="${esc(p.id)}" ${p.id === l.projectId ? 'selected' : ''}>${p.assigned ? '★ ' : ''}${esc(p.code)}</option>`).join('')}</select></td>
      <td class="l">${actSel}</td>
      ${DAYS.map((d, j) => `<td><input class="h ${j >= 5 ? 'weekend' : ''}" type="number" min="0" max="24" step="0.5" data-h="${j}" data-i="${i}" value="${l.hours?.[j] || ''}" ${dis} aria-label="${d} hours"></td>`).join('')}
      <td class="num"><b data-tot="${i}">${num((l.hours || []).reduce((s, h) => s + Number(h || 0), 0), 1)}</b></td>
      <td>${claimable ? `<input type="number" min="0" max="100" data-k="claimPct" data-i="${i}" value="${l.claimPct ?? ''}" placeholder="${esc(Math.round(act.pctComplete || 0))}" style="width:62px" ${dis} title="Claim % complete (applied on approval)">` : '<span class="muted small">—</span>'}</td>
      <td><input data-k="note" data-i="${i}" value="${esc(l.note || '')}" ${dis} style="width:140px"></td>
      <td>${editable ? `<button class="btn ghost sm" data-rm="${i}" aria-label="Remove line">✕</button>` : ''}</td>
    </tr>`;
  };

  const draw = () => {
    const dayTot = DAYS.map((_, j) => lines.reduce((s, l) => s + Number(l.hours?.[j] || 0), 0));
    const total = dayTot.reduce((a, b) => a + b, 0);
    const flags = timesheetFlags({ lines }, resource);
    el.innerHTML = `<div class="stack">
      <div class="card"><div class="row">
        ${approver ? `<select id="res">${app.boot.resources.filter((r) => r.type !== 'material' && r.active !== false).map((r) => `<option value="${esc(r.id)}" ${r.id === ui.resourceId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>` : `<b>${esc(resource?.name || '')}</b>`}
        <button class="btn" id="prev" aria-label="Previous week">←</button>
        <input type="date" id="wk" value="${esc(ui.week)}">
        <button class="btn" id="next" aria-label="Next week">→</button>
        <button class="btn ghost" id="today">This week</button>
        <span class="right"></span>
        <span class="pill">${esc(ts.status)}</span>
        <b style="font-size:18px" data-head-total>${num(total, 1)} h</b>
      </div>
      ${ts.status === 'rejected' && ts.comment ? `<div class="callout warn" style="margin-top:10px">Returned by ${esc(ts.reviewedBy || 'approver')}: ${esc(ts.comment)}</div>` : ''}
      ${ts.status === 'approved' ? `<div class="callout" style="margin-top:10px">Approved by ${esc(ts.reviewedBy || '')} on ${date((ts.reviewedAt || '').slice(0, 10))}. Hours are now in actual cost and progress.</div>` : ''}
      ${ts.status === 'submitted' ? `<div class="callout" style="margin-top:10px">Submitted — waiting for approval. You can recall it to make changes.</div>` : ''}
      </div>
      <div class="card flush"><div class="table-wrap"><table class="ts-grid">
        <thead><tr><th class="l">Project</th><th class="l">Activity / category</th>${DAYS.map((d, j) => `<th>${d}<div class="muted small" style="font-weight:400">${fmtDate(addDays(ui.week, j)).slice(0, 6)}</div></th>`).join('')}<th class="num">Total</th><th title="Claimed % complete">Claim %</th><th>Note</th><th></th></tr></thead>
        <tbody>${lines.map(lineRow).join('') || `<tr><td colspan="13" class="empty">No lines yet. ${editable ? 'Add a line, or fill from your assignments.' : ''}</td></tr>`}</tbody>
        <tfoot><tr><td class="l" colspan="2">Daily total</td>${dayTot.map((t, j) => `<td data-daytot="${j}" class="${t > 12 ? 'over' : ''}">${num(t, 1)}</td>`).join('')}<td class="num" data-grand>${num(total, 1)}</td><td colspan="3"></td></tr></tfoot>
      </table></div>
      ${editable ? `<div class="row" style="padding:12px 16px"><button class="btn" id="add">${icons.plus} Line</button><button class="btn" id="fill">Fill from my assignments</button><button class="btn" id="copy">Copy last week</button><span class="right"></span><button class="btn" id="save">Save draft</button><button class="btn primary" id="submit">Submit for approval</button></div>` : ts.status === 'submitted' && (app.user.resourceId === ui.resourceId || approver) ? '<div class="row" style="padding:12px 16px"><button class="btn" id="recall">Recall</button></div>' : ''}
      </div>
      <div id="flags">${flagsHtml(flags)}</div>
      <p class="muted small">★ = activities you are assigned to. Approved hours set the activity's actual start automatically; a claimed % (physical / duration methods) updates progress when your manager approves.</p>
    </div>`;
    wire();
  };

  // Update totals and checks in place — never rebuild the grid while an input is blurring.
  const updateTotals = () => {
    const dayTot = DAYS.map((_, j) => lines.reduce((s, l) => s + Number(l.hours?.[j] || 0), 0));
    dayTot.forEach((t, j) => {
      const c = el.querySelector(`[data-daytot="${j}"]`);
      if (c) {
        c.textContent = num(t, 1);
        c.classList.toggle('over', t > 12);
      }
    });
    const total = dayTot.reduce((a, b) => a + b, 0);
    const g = el.querySelector('[data-grand]');
    if (g) g.textContent = num(total, 1);
    const h = el.querySelector('[data-head-total]');
    if (h) h.textContent = `${num(total, 1)} h`;
    const f = el.querySelector('#flags');
    if (f) f.innerHTML = flagsHtml(timesheetFlags({ lines }, resource));
  };

  const go = (week) => {
    location.hash = `#/timesheet/mine/${weekStart(week)}`;
  };
  const save = async () => {
    const clean = lines.filter((l) => (l.hours || []).some((h) => Number(h) > 0) || l.activityId);
    for (const l of clean) if (l.projectId && !l.activityId) throw new Error('Choose an activity for every project line');
    return app.api.put('timesheets', { resourceId: ui.resourceId, weekStart: ui.week, lines: clean });
  };
  const wire = () => {
    el.querySelector('#res')?.addEventListener('change', (e) => {
      ui.resourceId = e.target.value;
      app.rerender();
    });
    el.querySelector('#prev').onclick = () => go(addDays(ui.week, -7));
    el.querySelector('#next').onclick = () => go(addDays(ui.week, 7));
    el.querySelector('#today').onclick = () => go(todayIso());
    el.querySelector('#wk').onchange = (e) => e.target.value && go(e.target.value);
    el.querySelectorAll('[data-h]').forEach((inp) =>
      inp.addEventListener('input', () => {
        const l = lines[inp.dataset.i];
        l.hours = l.hours || [0, 0, 0, 0, 0, 0, 0];
        l.hours[inp.dataset.h] = Number(inp.value || 0);
        el.querySelector(`[data-tot="${inp.dataset.i}"]`).textContent = num(l.hours.reduce((s, h) => s + Number(h || 0), 0), 1);
      }),
    );
    el.querySelectorAll('[data-h]').forEach((inp) => inp.addEventListener('change', updateTotals));
    el.querySelectorAll('[data-k]').forEach((inp) =>
      inp.addEventListener('change', () => {
        const l = lines[inp.dataset.i];
        const k = inp.dataset.k;
        l[k] = k === 'claimPct' ? (inp.value === '' ? null : Number(inp.value)) : inp.value || null;
        if (k === 'projectId') {
          l.activityId = null;
          l.category = l.projectId ? 'project' : 'overhead';
        }
        if (k === 'projectId' || k === 'activityId') draw();
      }),
    );
    el.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => {
      lines.splice(Number(b.dataset.rm), 1);
      draw();
    }));
    el.querySelector('#add')?.addEventListener('click', () => {
      const p = options.find((x) => x.assigned) || options[0];
      lines.push({ projectId: p?.id || null, activityId: null, category: p ? 'project' : 'overhead', hours: [0, 0, 0, 0, 0, 0, 0], note: '', claimPct: null });
      draw();
    });
    el.querySelector('#fill')?.addEventListener('click', () => {
      let n = 0;
      for (const p of options) for (const a of p.activities) {
        if (!a.assigned || a.complete || lines.some((l) => l.activityId === a.id)) continue;
        lines.push({ projectId: p.id, activityId: a.id, category: 'project', hours: [0, 0, 0, 0, 0, 0, 0], note: '', claimPct: null });
        n++;
      }
      toast(n ? `${n} assigned activities added` : 'No open assigned activities to add');
      draw();
    });
    el.querySelector('#copy')?.addEventListener('click', async () => {
      const prev = await app.api.get('timesheets', { resourceId: ui.resourceId, weekStart: addDays(ui.week, -7) });
      if (!prev.lines?.length) return toast('Nothing booked last week');
      lines.splice(0, lines.length, ...prev.lines.map((l) => ({ ...l, claimPct: null })));
      draw();
      toast('Copied last week — review before submitting');
    });
    el.querySelector('#save')?.addEventListener('click', async () => {
      try {
        await save();
        toast('Draft saved');
        app.rerender();
      } catch (e) {
        toast(e.message, 'error');
      }
    });
    el.querySelector('#submit')?.addEventListener('click', async () => {
      try {
        const saved = await save();
        await app.api.post(`timesheets/${saved.id}/submit`);
        toast('Timesheet submitted for approval');
        app.rerender();
      } catch (e) {
        toast(e.message, 'error');
      }
    });
    el.querySelector('#recall')?.addEventListener('click', async () => {
      await app.api.post(`timesheets/${ts.id}/recall`);
      toast('Timesheet recalled to draft');
      app.rerender();
    });
  };
  draw();
}

function flagsHtml(flags) {
  if (!flags.length) return '';
  return `<div class="card"><h3>Checks</h3>${flags.map((f) => `<div class="insight ${f.level === 'critical' ? 'critical' : f.level === 'warning' ? 'warning' : 'info'}"><span class="ico">${f.level === 'critical' ? '!' : 'i'}</span><div class="t" style="font-weight:500">${esc(f.message)}</div></div>`).join('')}</div>`;
}

// ---- approvals ---------------------------------------------------------------------
async function approvals(el, app) {
  const pending = await app.api.get('timesheets', { status: 'submitted' });
  const lastWeek = addDays(weekStart(todayIso()), -7);
  const recent = await app.api.get('timesheets', { from: lastWeek, to: lastWeek });
  const submittedIds = new Set(recent.filter((t) => t.status !== 'draft').map((t) => t.resourceId));
  const missing = app.boot.resources.filter((r) => r.type === 'labour' && r.active !== false && !submittedIds.has(r.id));
  const actName = new Map();
  const projCode = new Map(app.boot.projects.map((p) => [p.id, p.code]));
  if (pending.length) {
    const opts = await Promise.all([...new Set(pending.map((t) => t.resourceId))].map((rid) => app.api.get('timesheets/options', { resourceId: rid })));
    for (const list of opts) for (const p of list) for (const a of p.activities) actName.set(a.id, `${a.code} ${a.name}`);
  }
  el.innerHTML = `<div class="stack">
    <div class="card flush"><header><h3>Waiting for approval (${pending.length})</h3>${pending.length ? '<button class="btn primary sm" id="all">Approve all without critical flags</button>' : ''}</header>
      ${pending.length ? pending.sort((a, b) => a.weekStart.localeCompare(b.weekStart)).map((t) => {
        const r = app.resource(t.resourceId);
        const crit = t.flags.filter((f) => f.level === 'critical');
        return `<div class="ts-appr" data-res="${esc(t.resourceId)}" style="padding:12px 16px;border-top:1px solid var(--border)">
          <div class="row"><b>${esc(r?.name || t.resourceId)}</b><span class="muted small">w/c ${date(t.weekStart)}</span><span class="pill">${num(t.total, 1)} h</span>${crit.length ? rag('red', `${crit.length} fatigue flag${crit.length > 1 ? 's' : ''}`) : ''}
            <span class="right"></span><button class="btn sm" data-reject="${esc(t.id)}">Return</button><button class="btn primary sm" data-approve="${esc(t.id)}">Approve</button></div>
          <table class="data" style="margin-top:8px"><tbody>${t.lines.map((l) => `<tr><td class="small" style="width:90px">${esc(l.projectId ? projCode.get(l.projectId) || '' : 'Non-project')}</td><td class="small">${esc(l.activityId ? actName.get(l.activityId) || l.activityId : CATEGORIES.find((c) => c[0] === l.category)?.[1] || l.category)}${l.claimPct !== null && l.claimPct !== undefined ? ` · <b>claims ${num(l.claimPct)}%</b>` : ''}${l.note ? ` · <span class="muted">${esc(l.note)}</span>` : ''}</td>${l.hours.map((h) => `<td class="num small" style="width:38px">${h ? num(h, 1) : '<span class="muted">·</span>'}</td>`).join('')}<td class="num small"><b>${num(l.hours.reduce((s, h) => s + h, 0), 1)}</b></td></tr>`).join('')}</tbody></table>
          ${t.flags.length ? `<div class="small muted" style="margin-top:4px">${t.flags.map((f) => esc(f.message)).join(' · ')}</div>` : ''}
        </div>`;
      }).join('') : '<div class="empty">Nothing waiting — all caught up.</div>'}
    </div>
    <div class="card"><header><h3>Not yet submitted for w/c ${date(lastWeek)}</h3><span class="muted small">${missing.length} resources</span></header>
      ${missing.length ? `<div class="row">${missing.map((r) => `<span class="pill">${esc(r.name)}</span>`).join('')}</div>` : '<div class="muted">Everyone has submitted.</div>'}
    </div>
  </div>`;
  const act = async (id, action, comment) => {
    try {
      await app.api.post(`timesheets/${id}/${action}`, { comment });
    } catch (e) {
      toast(e.message, 'error');
      return false;
    }
    return true;
  };
  el.querySelectorAll('[data-approve]').forEach((b) => (b.onclick = async () => {
    if (await act(b.dataset.approve, 'approve')) {
      toast('Approved — actuals posted to the schedule');
      app.rerender();
    }
  }));
  el.querySelectorAll('[data-reject]').forEach((b) => (b.onclick = async () => {
    const r = await modal({ title: 'Return timesheet', body: '<label class="field">Reason (sent to the person)<textarea name="c" rows="3"></textarea></label>', actions: [{ label: 'Cancel', value: null }, { label: 'Return', primary: true, handler: (root) => root.querySelector('[name=c]').value || 'Please review' }] });
    if (r && (await act(b.dataset.reject, 'reject', r))) {
      toast('Timesheet returned');
      app.rerender();
    }
  }));
  el.querySelector('#all')?.addEventListener('click', async () => {
    let n = 0;
    for (const t of pending) if (!t.flags.some((f) => f.level === 'critical') && (await act(t.id, 'approve'))) n++;
    toast(`${n} timesheets approved`);
    app.rerender();
  });
}

// ---- reports -----------------------------------------------------------------------------
async function reports(el, app, actions) {
  ui.to = ui.to || weekStart(todayIso());
  ui.from = ui.from || addDays(ui.to, -7 * 11);
  const rows = await app.api.get('reports/hours', { from: ui.from, to: ui.to, groupBy: 'resourceId,projectId,week', statuses: ui.include });
  const filtered = ui.projectId ? rows.filter((r) => r.projectId === ui.projectId) : rows;
  const weeks = [];
  for (let d = toDay(weekStart(ui.from)); d <= toDay(ui.to); d += 7) weeks.push(fromDay(d));
  const keyOf = (r) => (ui.group === 'resource' ? r.resourceId : r.projectId || '');
  const labelOf = (k) => (ui.group === 'resource' ? app.resource(k)?.name || k : k ? app.project(k)?.code || k : 'Non-project');
  const matrix = new Map();
  const costBy = new Map();
  for (const r of filtered) {
    const k = keyOf(r);
    if (!matrix.has(k)) matrix.set(k, new Map());
    matrix.get(k).set(r.week, (matrix.get(k).get(r.week) || 0) + r.hours);
    costBy.set(k, (costBy.get(k) || 0) + (r.cost || 0));
  }
  const keys = [...matrix.keys()].sort((a, b) => labelOf(a).localeCompare(labelOf(b)));
  const weekTotals = weeks.map((w) => keys.reduce((s, k) => s + (matrix.get(k).get(w) || 0), 0));
  const grand = weekTotals.reduce((a, b) => a + b, 0);

  // chart: stacked by project (max 4 + other) per week
  const byProj = new Map();
  for (const r of filtered) {
    const k = r.projectId || '';
    byProj.set(k, (byProj.get(k) || 0) + r.hours);
  }
  const topProj = [...byProj.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const shownProj = topProj.slice(0, 3);
  const colors = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--surface-3)'];
  const stacks = shownProj.map((k, i) => ({ name: k ? app.project(k)?.code || k : 'Non-project', color: colors[i], values: weeks.map((w) => filtered.filter((r) => (r.projectId || '') === k && r.week === w).reduce((s, r) => s + r.hours, 0)) }));
  if (topProj.length > 3) stacks.push({ name: 'Other', color: 'var(--axis)', values: weeks.map((w) => filtered.filter((r) => !shownProj.includes(r.projectId || '') && r.week === w).reduce((s, r) => s + r.hours, 0)) });

  el.innerHTML = `<div class="stack">
    <div class="card"><div class="row">
      <label class="field">From week<input type="date" id="from" value="${esc(ui.from)}"></label>
      <label class="field">To week<input type="date" id="to" value="${esc(ui.to)}"></label>
      <label class="field">Rows<select id="group"><option value="resource" ${ui.group === 'resource' ? 'selected' : ''}>Resource</option><option value="project" ${ui.group === 'project' ? 'selected' : ''}>Project</option></select></label>
      <label class="field">Project<select id="proj"><option value="">All projects</option>${app.boot.projects.map((p) => `<option value="${esc(p.id)}" ${p.id === ui.projectId ? 'selected' : ''}>${esc(p.code)}</option>`).join('')}</select></label>
      <label class="field">Include<select id="inc"><option value="approved,submitted" ${ui.include === 'approved,submitted' ? 'selected' : ''}>Approved + submitted</option><option value="approved" ${ui.include === 'approved' ? 'selected' : ''}>Approved only</option></select></label>
      <span class="right"></span><button class="btn" id="csv" style="align-self:flex-end">${icons.download} CSV</button>
    </div></div>
    <div class="card"><header><h3>Hours per week</h3><span class="muted small">${num(grand, 1)} h in range</span></header><div id="chart"></div></div>
    <div class="card flush"><header><h3>${ui.group === 'resource' ? 'Resource' : 'Project'} × week</h3></header>
      <div class="table-wrap tall"><table class="data"><thead><tr><th>${ui.group === 'resource' ? 'Resource' : 'Project'}</th>${weeks.map((w) => `<th class="num">${fmtDate(w).slice(0, 6)}</th>`).join('')}<th class="num">Total h</th><th class="num">Cost</th></tr></thead>
      <tbody>${keys.map((k) => {
        const m = matrix.get(k);
        const t = weeks.reduce((s, w) => s + (m.get(w) || 0), 0);
        return `<tr><td class="nowrap">${esc(labelOf(k))}</td>${weeks.map((w) => `<td class="num">${m.get(w) ? num(m.get(w), 1) : '<span class="muted">·</span>'}</td>`).join('')}<td class="num"><b>${num(t, 1)}</b></td><td class="num">${money(costBy.get(k))}</td></tr>`;
      }).join('') || `<tr><td colspan="${weeks.length + 3}" class="empty">No hours booked in this range</td></tr>`}</tbody>
      <tfoot><tr><td><b>Total</b></td>${weekTotals.map((t) => `<td class="num"><b>${num(t, 1)}</b></td>`).join('')}<td class="num"><b>${num(grand, 1)}</b></td><td class="num"><b>${money([...costBy.values()].reduce((a, b) => a + b, 0))}</b></td></tr></tfoot></table></div></div>
  </div>`;
  if (weeks.length && grand) {
    columnChart(el.querySelector('#chart'), { categories: weeks, stacks, yFormat: (v) => `${num(v)}h`, catFormat: (w) => fmtDate(w).slice(0, 6), tipTitle: (w) => `w/c ${fmtDate(w)}`, height: 240 });
  } else el.querySelector('#chart').innerHTML = '<div class="empty">No hours in range</div>';
  const set = (id, k) => (el.querySelector(id).onchange = (e) => {
    ui[k] = e.target.value;
    reports(el, app, actions);
  });
  set('#from', 'from');
  set('#to', 'to');
  set('#group', 'group');
  set('#proj', 'projectId');
  set('#inc', 'include');
  el.querySelector('#csv').onclick = () =>
    download(`hours-${ui.from}-to-${ui.to}.csv`, toCsv(filtered, [
      { label: 'Week commencing', value: 'week' },
      { label: 'Resource', value: (r) => app.resource(r.resourceId)?.name || r.resourceId },
      { label: 'Project', value: (r) => (r.projectId ? app.project(r.projectId)?.code : 'Non-project') },
      { label: 'Hours', value: (r) => r.hours },
      { label: 'Cost', value: (r) => Math.round(r.cost || 0) },
    ]), 'text/csv');
}
