import { esc, date, money, formDialog, pickFile, toast, modal, tableHtml, makeSortable, icons } from '../ui.js';
import { todayIso } from '../../core/dates.js';

export const PROJECT_FIELDS = (app) => [
  { name: 'code', label: 'Project code', required: true, placeholder: 'e.g. NNS-GCM' },
  { name: 'name', label: 'Project name', required: true },
  { name: 'client', label: 'Client' },
  { name: 'location', label: 'Location' },
  { name: 'sector', label: 'Sector', placeholder: 'e.g. Oil & Gas — Brownfield' },
  { name: 'portfolio', label: 'Portfolio / business unit' },
  { name: 'contractType', label: 'Contract type', placeholder: 'EPC Lump Sum, Reimbursable…' },
  { name: 'contractValue', label: 'Contract value', type: 'number' },
  { name: 'startDate', label: 'Planned start', type: 'date', required: true },
  { name: 'mustFinishBy', label: 'Contractual completion (must finish by)', type: 'date' },
  { name: 'calendarId', label: 'Default calendar', type: 'select', options: app.boot.calendars.map((c) => [c.id, c.name]) },
  { name: 'currency', label: 'Currency', type: 'select', options: ['GBP', 'EUR', 'USD', 'NOK', 'AED', 'SAR', 'QAR', 'AUD', 'CAD'].map((c) => [c, c]) },
  { name: 'status', label: 'Status', type: 'select', options: [['planning', 'Planning'], ['active', 'Active'], ['on-hold', 'On hold'], ['closed', 'Closed']] },
  { name: 'progressMode', label: 'Out-of-sequence progress', type: 'select', options: [['retained', 'Retained logic (recommended)'], ['override', 'Progress override']] },
  { name: 'description', label: 'Scope summary', type: 'textarea', full: true },
];

export async function render(el, _route, app, { title, actions }) {
  title.innerHTML = '<h1>Projects</h1><div class="muted small">Create, import and manage projects and what-if scenarios</div>';
  if (app.can('write')) {
    actions.innerHTML = `<button class="btn" data-a="import">${icons.import} Import P6 / MS Project</button><button class="btn primary" data-a="new">${icons.plus} New project</button>`;
    actions.querySelector('[data-a=new]').onclick = () => newProject(app);
    actions.querySelector('[data-a=import]').onclick = () => importDialog(app);
  }
  const projects = app.boot.projects;
  const pm = (id) => app.boot.users.find((u) => u.id === id)?.name || '';
  el.innerHTML = `<div class="card flush">${tableHtml(
    projects,
    [
      { label: 'Code', render: (p) => `<b>${esc(p.code)}</b>${p.scenarioOf ? ' <span class="pill">what-if</span>' : ''}` },
      { label: 'Name', render: (p) => `${esc(p.name)}<div class="muted small">${esc(p.client || '')}</div>` },
      { label: 'Sector', render: (p) => esc(p.sector || '') },
      { label: 'Contract', render: (p) => esc(p.contractType || '') },
      { label: 'Value', num: true, render: (p) => (p.contractValue ? money(p.contractValue, { compact: true, cur: p.currency }) : '—') },
      { label: 'Start', render: (p) => date(p.startDate) },
      { label: 'Data date', render: (p) => date(p.dataDate) },
      { label: 'Must finish', render: (p) => date(p.mustFinishBy) },
      { label: 'Status', render: (p) => `<span class="pill">${esc(p.status)}</span>` },
      { label: 'Source', render: (p) => `<span class="muted small">${esc(p.source || 'Keel')}${pm(p.pmUserId) ? ` · ${esc(pm(p.pmUserId))}` : ''}</span>` },
    ],
    { rowAttrs: (p) => `class="clickable" data-href="#/p/${esc(p.id)}"`, empty: 'No projects yet — create one or import from P6 / MS Project.' },
  )}</div>
  <div class="grid g3" style="margin-top:16px">
    <div class="card"><h3>Migrating from Primavera P6</h3><p class="muted small" style="margin-top:6px">Export an <b>.xer</b> from P6 (File → Export → Primavera PM). Keel imports WBS, activities, durations, constraints, actuals, relationships with lags, calendars, resources and assignments.</p></div>
    <div class="card"><h3>Migrating from MS Project</h3><p class="muted small" style="margin-top:6px">Save as <b>XML (*.xml)</b> in MS Project. Summary tasks become WBS, links and lags are preserved, resources and work become assignments.</p></div>
    <div class="card"><h3>Handing back to the client</h3><p class="muted small" style="margin-top:6px">Every project exports to MS Project XML (importable by P6 and MSP) and CSV from its <b>Baselines &amp; export</b> tab — so client P6 mandates never block you.</p></div>
  </div>`;
  el.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', () => (location.hash = tr.dataset.href)));
  makeSortable(el);
}

export async function newProject(app) {
  const fields = [...PROJECT_FIELDS(app), { name: 'template', label: 'Start from', type: 'select', options: [['epc', 'EPC template (E / P / C / Commissioning WBS)'], ['blank', 'Blank project']], full: true }];
  const created = await formDialog({
    title: 'New project',
    wide: true,
    fields,
    values: { startDate: todayIso(), calendarId: 'default', currency: app.boot.org.currency, status: 'active', progressMode: 'retained', template: 'epc' },
    submitLabel: 'Create project',
    onSubmit: (data) => app.api.post('projects', data),
  });
  if (created) {
    await app.refreshBoot();
    toast(`Project ${created.code} created`);
    location.hash = `#/p/${created.id}/schedule`;
  }
}

export async function importDialog(app) {
  const file = await pickFile('.xer,.xml,text/xml');
  if (!file) return;
  const format = file.name.toLowerCase().endsWith('.xer') || file.text.startsWith('ERMHDR') ? 'xer' : 'mspxml';
  const r = await modal({
    title: `Import ${format === 'xer' ? 'Primavera P6 XER' : 'MS Project XML'}`,
    body: `<p>File <b>${esc(file.name)}</b> (${Math.round(file.text.length / 1024)} KB).</p>
      <label class="field">Project name (optional — defaults to the name in the file)<input name="name"></label>
      <p class="muted small" style="margin-top:10px">Resources are matched to your pool by code; calendars by name. Imported schedules are recalculated by Keel's CPM engine — compare the finish date with the source tool as a first check.</p>`,
    actions: [
      { label: 'Cancel', value: null },
      {
        label: 'Import',
        primary: true,
        handler: async (root) => app.api.post('import', { format, text: file.text, name: root.querySelector('[name=name]').value || undefined }),
      },
    ],
  });
  if (r?.created?.length) {
    await app.refreshBoot();
    const c = r.created[0];
    toast(`Imported ${c.code}: ${c.activities} activities, ${c.relationships} relationships`);
    if (c.warnings?.length) {
      await modal({
        title: `Imported ${c.code} — please review`,
        body: `<p>${c.activities} activities, ${c.relationships} relationships and ${c.resources} resources were imported.</p>${c.warnings.map((w) => `<div class="callout warn" style="margin-top:8px">${esc(w)}</div>`).join('')}`,
        actions: [{ label: 'Open schedule', primary: true, value: true }],
      });
    }
    location.hash = `#/p/${c.id}/schedule`;
  }
}
