import { esc, date, money, pct, toast, modal, confirmDialog, icons, rag, download } from '../../ui.js';
import { PO_STAGES } from '../../../core/registers.js';
import { toCsv } from '../../../core/mspxml.js';

export async function render(el, ctx) {
  const { bundle, an, app } = ctx;
  const canWrite = app.can('write');
  const pos = [...bundle.procurement].sort((a, b) => String(a.tag).localeCompare(String(b.tag)));
  const value = pos.reduce((s, p) => s + Number(p.value || 0), 0);
  const placed = pos.filter((p) => p.actual?.PO).reduce((s, p) => s + Number(p.value || 0), 0);
  const red = pos.filter((p) => an.poStatus.get(p.id).rag === 'red');

  el.innerHTML = `<div class="stack">
    <div class="grid g4">
      <div class="card"><div class="muted small">Packages</div><div class="hero">${pos.length}</div><div class="muted small">${money(value, { compact: true })} total value</div></div>
      <div class="card"><div class="muted small">Committed (PO placed)</div><div class="hero">${pct(value ? (100 * placed) / value : 0)}</div><div class="muted small">${money(placed, { compact: true })}</div></div>
      <div class="card"><div class="muted small">Forecast late vs ROS</div><div class="hero" style="color:${red.length ? 'var(--critical-ink)' : 'inherit'}">${red.length}</div><div class="muted small">would delay the project</div></div>
      <div class="card"><div class="muted small">How ROS works</div><div class="small" style="margin-top:6px">Required-on-site = start of the activity that consumes the package (less buffer), read live from the schedule. <b>Amber</b>: delivery after planned need. <b>Red</b>: delivery beyond the activity's late start — the finish date moves.</div></div>
    </div>
    <div class="card flush"><header><h3>Procurement tracker</h3><button class="btn sm" id="csv">${icons.download} CSV</button>${canWrite ? `<button class="btn primary sm" id="add">${icons.plus} Package</button>` : ''}</header>
      <div class="table-wrap" style="margin-top:8px"><table class="data"><thead><tr><th>Tag</th><th>Package</th><th>Vendor / PO</th><th class="num">Value</th><th>Milestones</th><th class="num">Progress</th><th>Delivery</th><th>ROS (need)</th><th class="num">Float</th><th>Status</th></tr></thead><tbody>
      ${pos.map((p) => {
        const s = an.poStatus.get(p.id);
        return `<tr class="clickable" data-id="${esc(p.id)}"><td class="nowrap"><b>${esc(p.tag)}</b></td><td>${esc(p.description)}<div class="muted small">${p.notes ? esc(p.notes) : `Lead time ${esc(p.leadTimeWeeks ?? '—')} wks`}</div></td><td>${esc(p.vendor || '')}<div class="muted small mono">${esc(p.poNumber || 'PO not placed')}</div></td><td class="num">${money(p.value, { compact: true })}</td>
          <td><span class="stage-dots">${PO_STAGES.map((st) => `<i class="${p.actual?.[st.key] ? 'done' : !p.planned?.[st.key] && !p.forecast?.[st.key] ? 'na' : s.next === st.key && s.nextDue && s.nextDue < bundle.project.dataDate ? 'late' : ''}" title="${esc(st.label)}: planned ${esc(date(p.planned?.[st.key]))}${p.forecast?.[st.key] ? `, forecast ${esc(date(p.forecast[st.key]))}` : ''}${p.actual?.[st.key] ? `, actual ${esc(date(p.actual[st.key]))}` : ''}"></i>`).join('')}</span><div class="muted small">next: ${esc(s.next || 'complete')}</div></td>
          <td class="num">${pct(s.pct)}</td><td class="nowrap">${date(s.delivery)}${p.actual?.DEL ? ' A' : ''}</td><td class="nowrap">${date(s.ros)}<div class="muted small">${esc(ctx.acts.get(p.needActivityId)?.code || '')}</div></td>
          <td class="num ${s.floatDays !== null && s.floatDays < 0 ? 'status-rejected' : ''}">${s.floatDays === null ? '—' : `${s.floatDays}d`}</td><td>${rag(s.rag, { red: 'Delays project', amber: 'Eats float', green: 'OK' }[s.rag])}</td></tr>`;
      }).join('') || '<tr><td colspan="10" class="empty">No packages yet</td></tr>'}
      </tbody></table></div></div>
  </div>`;
  el.querySelector('#csv').onclick = () =>
    download(`${bundle.project.code}-procurement.csv`, toCsv(pos, [
      { label: 'Tag', value: 'tag' }, { label: 'Description', value: 'description' }, { label: 'Vendor', value: 'vendor' }, { label: 'PO', value: 'poNumber' }, { label: 'Value', value: 'value' },
      ...PO_STAGES.flatMap((s) => [{ label: `${s.key} planned`, value: (p) => p.planned?.[s.key] || '' }, { label: `${s.key} forecast`, value: (p) => p.forecast?.[s.key] || '' }, { label: `${s.key} actual`, value: (p) => p.actual?.[s.key] || '' }]),
      { label: 'ROS', value: (p) => an.poStatus.get(p.id).ros || '' }, { label: 'Float to ROS (days)', value: (p) => an.poStatus.get(p.id).floatDays ?? '' },
    ]), 'text/csv');
  el.querySelector('#add')?.addEventListener('click', () => editPo(ctx, null));
  el.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => editPo(ctx, bundle.procurement.find((p) => p.id === tr.dataset.id))));
}

async function editPo(ctx, po) {
  const { bundle, app } = ctx;
  const canWrite = app.can('write');
  const dis = canWrite ? '' : 'disabled';
  const v = po || { planned: {}, forecast: {}, actual: {}, rosBufferDays: 0, currency: bundle.project.currency };
  const actOpts = [['', '—'], ...bundle.activities.filter((a) => a.type === 'task').map((a) => [a.id, `${a.code} — ${a.name}`])];
  const sel = (n, cur) => `<select name="${n}" ${dis}>${actOpts.map(([id, l]) => `<option value="${esc(id)}" ${id === (cur || '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const body = `<div class="form-grid">
    <label class="field">Tag / package no.<input name="tag" value="${esc(v.tag || '')}" ${dis}></label>
    <label class="field">PO number<input name="poNumber" value="${esc(v.poNumber || '')}" ${dis}></label>
    <label class="field full">Description<input name="description" value="${esc(v.description || '')}" ${dis}></label>
    <label class="field">Vendor<input name="vendor" value="${esc(v.vendor || '')}" ${dis}></label>
    <label class="field">Value<input name="value" type="number" value="${esc(v.value ?? '')}" ${dis}></label>
    <label class="field">Supply activity (progress)${sel('activityId', v.activityId)}</label>
    <label class="field">Need activity (drives ROS)${sel('needActivityId', v.needActivityId)}</label>
    <label class="field">ROS buffer (calendar days)<input name="rosBufferDays" type="number" value="${esc(v.rosBufferDays ?? 0)}" ${dis}></label>
    <label class="field">Expeditor<input name="expeditor" value="${esc(v.expeditor || '')}" ${dis}></label>
    <label class="field full">Notes<textarea name="notes" rows="2" ${dis}>${esc(v.notes || '')}</textarea></label>
  </div>
  <table class="data" style="margin-top:14px"><thead><tr><th>Milestone</th><th>Credit</th><th>Planned</th><th>Forecast</th><th>Actual</th></tr></thead><tbody>
  ${PO_STAGES.map((s) => `<tr><td>${esc(s.key)} <span class="muted small">${esc(s.label)}</span></td><td>${s.weight}%</td>${['planned', 'forecast', 'actual'].map((k) => `<td><input type="date" data-k="${k}" data-s="${s.key}" value="${esc(v[k]?.[s.key] || '')}" ${dis}></td>`).join('')}</tr>`).join('')}
  </tbody></table>`;
  const actions = [{ label: 'Close', value: null }];
  if (canWrite && po) actions.unshift({ label: 'Delete', danger: true, handler: async () => {
    if (!(await confirmDialog('Delete package', `Delete ${po.tag}?`, { danger: true, ok: 'Delete' }))) return false;
    await app.api.del(`procurement/${po.id}`);
    return 'deleted';
  } });
  if (canWrite) actions.push({
    label: 'Save',
    primary: true,
    handler: async (root) => {
      const val = (n) => root.querySelector(`[name=${n}]`).value;
      const dates = { planned: {}, forecast: {}, actual: {} };
      root.querySelectorAll('[data-k]').forEach((i) => i.value && (dates[i.dataset.k][i.dataset.s] = i.value));
      const data = { tag: val('tag'), poNumber: val('poNumber'), description: val('description'), vendor: val('vendor'), value: Number(val('value') || 0), activityId: val('activityId') || null, needActivityId: val('needActivityId') || null, rosBufferDays: Number(val('rosBufferDays') || 0), expeditor: val('expeditor'), notes: val('notes'), ...dates };
      return po ? app.api.put(`procurement/${po.id}`, data) : app.api.post('procurement', { ...data, projectId: bundle.project.id });
    },
  });
  const r = await modal({ title: po ? `${po.tag} — ${po.description}` : 'New procurement package', body, wide: true, actions });
  if (r) {
    toast(r === 'deleted' ? 'Package deleted' : 'Package saved');
    ctx.reload();
  }
}
