import { esc, date, num, pct, toast, modal, formDialog, confirmDialog, icons, download } from '../../ui.js';
import { DOC_STAGES } from '../../../core/registers.js';
import { toCsv } from '../../../core/mspxml.js';

export async function render(el, ctx) {
  const { bundle, an, app } = ctx;
  const canWrite = app.can('write');
  const docs = [...bundle.deliverables].sort((a, b) => a.docNo.localeCompare(b.docNo));
  const disciplines = [...new Set(docs.map((d) => d.discipline).filter(Boolean))].sort();
  const totalW = docs.reduce((s, d) => s + Number(d.weightHours || 1), 0);
  const earned = docs.reduce((s, d) => s + (Number(d.weightHours || 1) * an.docStatus.get(d.id).pct) / 100, 0);
  const byDisc = disciplines.map((disc) => {
    const list = docs.filter((d) => d.discipline === disc);
    const w = list.reduce((s, d) => s + Number(d.weightHours || 1), 0);
    const e = list.reduce((s, d) => s + (Number(d.weightHours || 1) * an.docStatus.get(d.id).pct) / 100, 0);
    return { disc, count: list.length, pct: w ? (100 * e) / w : 0, overdue: list.filter((d) => an.docStatus.get(d.id).overdue).length, ifc: list.filter((d) => d.actual?.IFC).length };
  });
  ctx.ui.mdrDisc = ctx.ui.mdrDisc || '';
  const shown = ctx.ui.mdrDisc ? docs.filter((d) => d.discipline === ctx.ui.mdrDisc) : docs;

  el.innerHTML = `<div class="stack">
    <div class="grid g4">
      <div class="card"><div class="muted small">Engineering progress (weighted)</div><div class="hero">${pct(totalW ? (100 * earned) / totalW : 0)}</div><div class="muted small">${docs.length} deliverables</div></div>
      <div class="card"><div class="muted small">Issued for construction</div><div class="hero">${docs.filter((d) => d.actual?.IFC).length}</div><div class="muted small">of ${docs.length}</div></div>
      <div class="card"><div class="muted small">Overdue next issue</div><div class="hero" style="color:${docs.some((d) => an.docStatus.get(d.id).overdue) ? 'var(--critical-ink)' : 'inherit'}">${docs.filter((d) => an.docStatus.get(d.id).overdue).length}</div><div class="muted small">vs planned stage dates</div></div>
      <div class="card"><div class="muted small">Rules of credit</div><div class="small" style="margin-top:6px">${DOC_STAGES.map((s) => `${s.key} ${s.weight}%`).join(' · ')}</div><div class="muted small" style="margin-top:4px">Activities using the “Linked MDR / PO register” method earn from these automatically.</div></div>
    </div>
    <div class="card flush"><header><h3>Master deliverables register</h3>
      <select id="disc"><option value="">All disciplines</option>${disciplines.map((d) => `<option ${d === ctx.ui.mdrDisc ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>
      <button class="btn sm" id="csv">${icons.download} CSV</button>${canWrite ? `<button class="btn primary sm" id="add">${icons.plus} Deliverable</button>` : ''}</header>
      <div class="table-wrap tall" style="margin-top:8px"><table class="data"><thead><tr><th>Document no.</th><th>Title</th><th>Disc.</th><th>Rev</th><th>Stages</th><th class="num">Progress</th><th>Next</th><th>Due</th><th>Activity</th></tr></thead><tbody>
      ${shown.map((d) => {
        const s = an.docStatus.get(d.id);
        return `<tr class="clickable" data-id="${esc(d.id)}"><td class="nowrap mono">${esc(d.docNo)}</td><td>${esc(d.title)}<div class="muted small">${esc(d.docType || '')}</div></td><td>${esc(d.discipline || '')}</td><td>${esc(d.revision || '')}</td>
          <td><span class="stage-dots">${DOC_STAGES.map((st) => `<i class="${d.actual?.[st.key] ? 'done' : s.next === st.key && s.overdue ? 'late' : ''}" title="${esc(st.label)}: planned ${esc(date(d.planned?.[st.key]))}${d.actual?.[st.key] ? `, actual ${esc(date(d.actual[st.key]))}` : ''}"></i>`).join('')}</span></td>
          <td class="num">${pct(s.pct)}</td><td>${esc(s.next || '✓')}</td><td class="nowrap ${s.overdue ? 'status-rejected' : ''}">${date(s.due)}${s.overdue ? ` (${s.daysLate}d late)` : ''}</td><td class="small">${esc(ctx.acts.get(d.activityId)?.code || '')}</td></tr>`;
      }).join('') || '<tr><td colspan="9" class="empty">No deliverables yet</td></tr>'}
      </tbody></table></div></div>
    <div class="card flush"><header><h3>By discipline</h3></header><div class="table-wrap"><table class="data"><thead><tr><th>Discipline</th><th class="num">Docs</th><th class="num">IFC</th><th class="num">Overdue</th><th class="num">Progress</th><th></th></tr></thead><tbody>
      ${byDisc.map((x) => `<tr><td>${esc(x.disc)}</td><td class="num">${num(x.count)}</td><td class="num">${num(x.ifc)}</td><td class="num">${num(x.overdue)}</td><td class="num">${pct(x.pct)}</td><td style="width:30%"><div class="progress"><span style="width:${x.pct}%;background:var(--s3)"></span></div></td></tr>`).join('')}
    </tbody></table></div></div>
  </div>`;
  el.querySelector('#disc').onchange = (e) => {
    ctx.ui.mdrDisc = e.target.value;
    render(el, ctx);
  };
  el.querySelector('#csv').onclick = () =>
    download(
      `${bundle.project.code}-MDR.csv`,
      toCsv(docs, [
        { label: 'Document no.', value: 'docNo' },
        { label: 'Title', value: 'title' },
        { label: 'Discipline', value: 'discipline' },
        { label: 'Type', value: 'docType' },
        { label: 'Revision', value: 'revision' },
        ...DOC_STAGES.flatMap((s) => [
          { label: `${s.key} planned`, value: (d) => d.planned?.[s.key] || '' },
          { label: `${s.key} actual`, value: (d) => d.actual?.[s.key] || '' },
        ]),
        { label: 'Progress %', value: (d) => an.docStatus.get(d.id).pct },
      ]),
      'text/csv',
    );
  el.querySelector('#add')?.addEventListener('click', () => editDoc(ctx, null));
  el.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => editDoc(ctx, bundle.deliverables.find((d) => d.id === tr.dataset.id))));
}

async function editDoc(ctx, doc) {
  const { bundle, app } = ctx;
  const canWrite = app.can('write');
  const dis = canWrite ? '' : 'disabled';
  const v = doc || { planned: {}, actual: {} };
  const actOpts = bundle.activities.filter((a) => a.type === 'task').map((a) => [a.id, `${a.code} — ${a.name}`]);
  const body = `<div class="form-grid">
    <label class="field">Document no.<input name="docNo" value="${esc(v.docNo || `${bundle.project.code}-`)}" ${dis}></label>
    <label class="field">Revision<input name="revision" value="${esc(v.revision || '')}" ${dis}></label>
    <label class="field full">Title<input name="title" value="${esc(v.title || '')}" ${dis}></label>
    <label class="field">Discipline<input name="discipline" value="${esc(v.discipline || '')}" ${dis}></label>
    <label class="field">Document type<input name="docType" value="${esc(v.docType || '')}" ${dis}></label>
    <label class="field">Linked activity<select name="activityId" ${dis}><option value="">—</option>${actOpts.map(([id, l]) => `<option value="${esc(id)}" ${id === v.activityId ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
    <label class="field">Weight (budget hours)<input name="weightHours" type="number" value="${esc(v.weightHours ?? 40)}" ${dis}></label>
  </div>
  <table class="data" style="margin-top:14px"><thead><tr><th>Stage</th><th>Credit</th><th>Planned</th><th>Actual</th></tr></thead><tbody>
  ${DOC_STAGES.map((s) => `<tr><td>${esc(s.key)} <span class="muted small">${esc(s.label)}</span></td><td>${s.weight}%</td><td><input type="date" data-p="${s.key}" value="${esc(v.planned?.[s.key] || '')}" ${dis}></td><td><input type="date" data-a="${s.key}" value="${esc(v.actual?.[s.key] || '')}" ${dis}></td></tr>`).join('')}
  </tbody></table>`;
  const actions = [{ label: 'Close', value: null }];
  if (canWrite && doc) actions.unshift({ label: 'Delete', danger: true, handler: async () => {
    if (!(await confirmDialog('Delete deliverable', `Delete ${doc.docNo}?`, { danger: true, ok: 'Delete' }))) return false;
    await app.api.del(`deliverables/${doc.id}`);
    return 'deleted';
  } });
  if (canWrite) actions.push({
    label: 'Save',
    primary: true,
    handler: async (root) => {
      const val = (n) => root.querySelector(`[name=${n}]`).value;
      const planned = {};
      const actual = {};
      root.querySelectorAll('[data-p]').forEach((i) => i.value && (planned[i.dataset.p] = i.value));
      root.querySelectorAll('[data-a]').forEach((i) => i.value && (actual[i.dataset.a] = i.value));
      const data = { docNo: val('docNo'), revision: val('revision'), title: val('title'), discipline: val('discipline'), docType: val('docType'), activityId: val('activityId') || null, weightHours: Number(val('weightHours') || 0), planned, actual };
      return doc ? app.api.put(`deliverables/${doc.id}`, data) : app.api.post('deliverables', { ...data, projectId: bundle.project.id });
    },
  });
  const r = await modal({ title: doc ? doc.docNo : 'New deliverable', body, wide: true, actions });
  if (r) {
    toast(r === 'deleted' ? 'Deliverable deleted' : 'Deliverable saved');
    ctx.reload();
  }
}

export { formDialog };
