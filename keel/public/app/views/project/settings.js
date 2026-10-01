import { esc, date, money, toast, formDialog, confirmDialog, download, icons, tableHtml } from '../../ui.js';
import { bundleToMspXml, toCsv } from '../../../core/mspxml.js';

export async function render(el, ctx) {
  const { bundle, an, app } = ctx;
  const p = bundle.project;
  const canWrite = app.can('write');
  const audit = canWrite ? await app.api.get('audit', { projectId: p.id, limit: 60 }) : [];
  el.innerHTML = `<div class="stack">
    <div class="grid g2">
      <div class="card flush"><header><h3>Baselines</h3>${canWrite ? `<button class="btn primary sm" id="bl">${icons.plus} Capture baseline</button>` : ''}</header>
        ${tableHtml(bundle.baselines.slice().reverse(), [
          { label: 'Name', render: (b) => `<b>${esc(b.name)}</b>${b.id === p.activeBaselineId ? ' <span class="pill rag-green"><span class="dot"></span>Active</span>' : ''}<div class="muted small">by ${esc(b.createdBy || '')}</div>` },
          { label: 'Captured', render: (b) => date(b.createdAt.slice(0, 10)) },
          { label: 'Data date', render: (b) => date(b.dataDate) },
          { label: 'Finish', render: (b) => date(b.finish) },
          { label: 'Budget', num: true, render: (b) => money(b.budget, { compact: true }) },
          { label: '', render: (b) => (canWrite ? `${b.id !== p.activeBaselineId ? `<button class="btn sm" data-use="${esc(b.id)}">Make active</button>` : ''} <button class="btn ghost sm danger" data-delbl="${esc(b.id)}">Delete</button>` : '') },
        ], { empty: 'No baselines yet — capture one to measure variance and earned value against it.' })}
      </div>
      <div class="card"><header><h3>Export & hand-over</h3></header>
        <div class="stack">
          <div class="row"><button class="btn" id="msp">${icons.download} MS Project XML</button><span class="muted small">Opens in MS Project; imports into Primavera P6 (File → Import → MS Project XML).</span></div>
          <div class="row"><button class="btn" id="csv">${icons.download} Schedule CSV</button><span class="muted small">Activities with early/late dates, float, baseline variance.</span></div>
          <div class="row"><button class="btn" id="evcsv">${icons.download} S-curve CSV</button><span class="muted small">Weekly PV / EV / AC / forecast.</span></div>
          <div class="row"><button class="btn" id="print">Print / PDF report</button><span class="muted small">Opens the overview in your browser's print dialog.</span></div>
        </div>
      </div>
    </div>
    <div class="grid g2">
      <div class="card"><header><h3>What-if scenarios</h3></header>
        <p class="muted small">Copy this project (logic, resources, risks) into a sandbox to test recovery options, resequencing or acceleration without touching the live programme. Compare finish dates on the Portfolio page.</p>
        ${canWrite ? '<button class="btn" id="copy">Create what-if copy</button>' : ''}
        ${p.scenarioOf ? `<div class="callout" style="margin-top:10px">This is a what-if copy of <a href="#/p/${esc(p.scenarioOf)}">${esc(app.project(p.scenarioOf)?.code || 'the source project')}</a>.</div>` : ''}
        ${app.can('approve') ? `<hr style="border:0;border-top:1px solid var(--border);margin:16px 0"><button class="btn danger" id="delp">Delete project</button>` : ''}
      </div>
      <div class="card flush"><header><h3>Audit trail</h3><span class="muted small">Who changed what, and when</span></header>
        <div class="table-wrap" style="max-height:320px"><table class="data"><tbody>${audit.map((a) => `<tr><td class="nowrap small">${esc(new Date(a.ts).toLocaleString('en-GB'))}</td><td class="small">${esc(a.userName)}</td><td class="small">${esc(a.action)} ${esc(a.entity)}</td><td class="small muted">${esc(a.summary || '')}</td></tr>`).join('') || '<tr><td class="muted">No entries yet</td></tr>'}</tbody></table></div>
      </div>
    </div>
  </div>`;

  el.querySelector('#bl')?.addEventListener('click', async () => {
    const r = await formDialog({
      title: 'Capture baseline',
      fields: [{ name: 'name', label: 'Baseline name', required: true }, { name: 'makeActive', label: 'Make this the active baseline', type: 'checkbox' }],
      values: { name: `Rev ${bundle.baselines.length} — ${date(p.dataDate)}`, makeActive: true },
      onSubmit: (d) => app.api.post(`projects/${p.id}/baselines`, d),
    });
    if (r) {
      toast('Baseline captured');
      ctx.reload();
    }
  });
  el.querySelectorAll('[data-use]').forEach((b) => (b.onclick = async () => {
    await app.api.put(`projects/${p.id}`, { activeBaselineId: b.dataset.use });
    toast('Active baseline changed');
    ctx.reload({ boot: true });
  }));
  el.querySelectorAll('[data-delbl]').forEach((b) => (b.onclick = async () => {
    if (!(await confirmDialog('Delete baseline', 'Delete this baseline? Variance and EV will use another baseline (or none).', { danger: true, ok: 'Delete' }))) return;
    await app.api.del(`baselines/${b.dataset.delbl}`);
    ctx.reload({ boot: true });
  }));
  el.querySelector('#msp').onclick = () => {
    const xml = bundleToMspXml({ ...bundle, resources: app.boot.resources.filter((r) => bundle.assignments.some((a) => a.resourceId === r.id)), sched: an.sched, calendar: an.pcal });
    download(`${p.code}.xml`, xml, 'application/xml');
  };
  el.querySelector('#csv').onclick = () => {
    const rows = bundle.activities.map((a) => ({ a, r: an.sched.byId.get(a.id), v: an.variance.get(a.id) }));
    download(`${p.code}-schedule.csv`, toCsv(rows, [
      { label: 'Activity ID', value: (x) => x.a.code }, { label: 'Name', value: (x) => x.a.name }, { label: 'Start', value: (x) => x.r.start }, { label: 'Finish', value: (x) => x.r.finish },
      { label: 'Total float', value: (x) => x.r.tf ?? '' }, { label: 'Critical', value: (x) => (x.r.critical ? 'Y' : 'N') }, { label: 'Baseline finish', value: (x) => x.v?.blFinish || '' }, { label: 'Variance', value: (x) => x.v?.finish ?? '' },
    ]), 'text/csv');
  };
  el.querySelector('#evcsv').onclick = () => download(`${p.code}-scurve.csv`, toCsv(an.evm.series, [{ label: 'Week', value: 'week' }, { label: 'PV', value: (s) => Math.round(s.pv) }, { label: 'EV', value: (s) => (s.ev === undefined ? '' : Math.round(s.ev)) }, { label: 'AC', value: (s) => (s.ac === undefined ? '' : Math.round(s.ac)) }, { label: 'Forecast', value: (s) => (s.forecast === undefined ? '' : Math.round(s.forecast)) }]), 'text/csv');
  el.querySelector('#print').onclick = () => {
    location.hash = `#/p/${p.id}/overview`;
    setTimeout(() => window.print(), 800);
  };
  el.querySelector('#copy')?.addEventListener('click', async () => {
    const r = await formDialog({
      title: 'Create what-if scenario',
      fields: [{ name: 'name', label: 'Scenario name', required: true }, { name: 'code', label: 'Code', required: true }],
      values: { name: `${p.name} — recovery option`, code: `${p.code}-WI${bundle.baselines.length + 1}` },
      onSubmit: (d) => app.api.post(`projects/${p.id}/copy`, d),
    });
    if (r) {
      await app.refreshBoot();
      toast('Scenario created');
      location.hash = `#/p/${r.id}/schedule`;
    }
  });
  el.querySelector('#delp')?.addEventListener('click', async () => {
    if (!(await confirmDialog('Delete project', `Permanently delete ${p.code} and all of its activities, registers and baselines? Timesheet history is kept.`, { danger: true, ok: 'Delete project' }))) return;
    await app.api.del(`projects/${p.id}`);
    await app.refreshBoot();
    toast('Project deleted');
    location.hash = '#/projects';
  });
}
