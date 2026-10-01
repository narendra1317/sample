import { esc, date, rag, toast, formDialog, confirmDialog, setCurrency } from '../ui.js';
import { analyseProject, insights } from '../../core/analysis.js';
import { addDays, weekStart } from '../../core/dates.js';
import { PROJECT_FIELDS } from './projects.js';

const TABS = [
  ['overview', 'Overview'],
  ['schedule', 'Schedule'],
  ['resources', 'Resources'],
  ['evm', 'Earned value'],
  ['risk', 'Risk & QSRA'],
  ['quality', 'Schedule quality'],
  ['mdr', 'Engineering MDR'],
  ['procurement', 'Procurement'],
  ['changes', 'Changes'],
  ['settings', 'Baselines & export'],
];

const tabModules = {
  overview: () => import('./project/overview.js'),
  schedule: () => import('./project/schedule.js'),
  resources: () => import('./project/resources.js'),
  evm: () => import('./project/evm.js'),
  risk: () => import('./project/risk.js'),
  quality: () => import('./project/quality.js'),
  mdr: () => import('./project/mdr.js'),
  procurement: () => import('./project/procurement.js'),
  changes: () => import('./project/changes.js'),
  settings: () => import('./project/settings.js'),
};

// keep per-project UI state (filters, zoom, collapsed WBS) across re-renders
const uiState = new Map();

export async function loadContext(app, projectId) {
  const bundle = await app.api.get(`projects/${projectId}/bundle`);
  const ctxData = { resources: app.boot.resources, calendars: app.boot.calendars, timesheets: bundle.timesheets };
  const an = analyseProject(bundle, ctxData);
  const ins = insights(an, bundle, ctxData);
  const acts = new Map(bundle.activities.map((a) => [a.id, a]));
  if (!uiState.has(projectId)) uiState.set(projectId, {});
  return { app, bundle, an, insights: ins, acts, project: bundle.project, ui: uiState.get(projectId), ctxData };
}

export async function render(el, route, app, { title, actions, isCurrent }) {
  let ctx;
  try {
    ctx = await loadContext(app, route.id);
  } catch (e) {
    el.innerHTML = `<div class="card"><h3>Project not available</h3><p class="muted">${esc(e.message)}</p><a href="#/projects">Back to projects</a></div>`;
    return;
  }
  if (!isCurrent()) return;
  const p = ctx.project;
  setCurrency(p.currency || app.boot.org.currency);
  const tab = TABS.some(([k]) => k === route.tab) ? route.tab : 'overview';
  const k = ctx.an.kpis;
  title.innerHTML = `<div class="row" style="gap:10px"><h1>${esc(p.code)}</h1>${rag(k.rag)}${p.scenarioOf ? '<span class="pill">what-if scenario</span>' : ''}</div><div class="muted small">${esc(p.name)} · data date <b>${date(p.dataDate)}</b> · forecast finish <b>${date(k.finish)}</b></div>`;
  if (app.can('write')) {
    actions.innerHTML = `<button class="btn" data-a="edit">Project settings</button><button class="btn primary" data-a="advance">Close period</button>`;
    actions.querySelector('[data-a=edit]').onclick = () => editProject(ctx);
    actions.querySelector('[data-a=advance]').onclick = () => closePeriod(ctx);
  }
  el.innerHTML = `<div class="tabs" role="tablist">${TABS.map(([key, label]) => `<a role="tab" href="#/p/${esc(p.id)}/${key}" class="${key === tab ? 'active' : ''}" aria-selected="${key === tab}">${label}</a>`).join('')}</div><div id="tab"></div>`;
  const host = el.querySelector('#tab');
  ctx.reload = async (opts = {}) => {
    const fresh = await loadContext(app, route.id);
    Object.assign(ctx, fresh);
    if (opts.boot) await app.refreshBoot();
    if (opts.full) return app.rerender();
    const mod = await tabModules[tab]();
    await mod.render(host, ctx);
  };
  const mod = await tabModules[tab]();
  await mod.render(host, ctx);
  if (ctx.an.sched.warnings.length) {
    for (const w of ctx.an.sched.warnings) toast(w.message, 'error');
  }
}

async function editProject(ctx) {
  const { app, project } = ctx;
  const fields = [...PROJECT_FIELDS(app), { name: 'pmUserId', label: 'Project manager', type: 'select', options: [['', '—'], ...app.boot.users.filter((u) => ['pm', 'admin'].includes(u.role)).map((u) => [u.id, u.name])] }];
  const r = await formDialog({ title: `Project settings — ${project.code}`, wide: true, fields, values: project, onSubmit: (d) => app.api.put(`projects/${project.id}`, d) });
  if (r) {
    toast('Project updated');
    await app.refreshBoot();
    app.rerender();
  }
}

async function closePeriod(ctx) {
  const { app, project } = ctx;
  const suggested = addDays(weekStart(project.dataDate), 7);
  const r = await formDialog({
    title: 'Close reporting period',
    fields: [{ name: 'dataDate', label: 'New data date (status date)', type: 'date', required: true, hint: 'Usually the Monday after the period being reported' }],
    values: { dataDate: suggested },
    extraHtml: `<div class="callout" style="margin-top:12px">Closing the period snapshots SPI, CPI, EV, AC and forecast finish into the project history (for trend reporting), then moves the data date forward. Unstarted work is rescheduled from the new data date and remaining durations of in-progress work are counted from it.</div>`,
    submitLabel: 'Close period',
    onSubmit: (d) => app.api.post(`projects/${project.id}/advance`, d),
  });
  if (r) {
    toast(`Data date moved to ${date(r.dataDate)}`);
    await app.refreshBoot();
    app.rerender();
  }
}

export { confirmDialog };
