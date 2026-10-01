import { esc, date, money, toast, modal, confirmDialog, icons, num } from '../../ui.js';

const TYPES = [['client-variation', 'Client variation'], ['internal', 'Internal change'], ['claim', 'Claim'], ['scope-transfer', 'Scope transfer']];
const STATUS = [['draft', 'Draft'], ['submitted', 'Submitted to client'], ['pending', 'Pending decision'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['implemented', 'Implemented']];

export async function render(el, ctx) {
  const { bundle, app } = ctx;
  const canWrite = app.can('write');
  const list = [...bundle.changes].sort((a, b) => String(a.ref).localeCompare(String(b.ref)));
  const sum = (f) => list.filter(f).reduce((s, c) => s + Number(c.costImpact || 0), 0);
  el.innerHTML = `<div class="stack">
    <div class="grid g4">
      <div class="card"><div class="muted small">Approved changes</div><div class="hero">${money(sum((c) => ['approved', 'implemented'].includes(c.status)), { compact: true })}</div></div>
      <div class="card"><div class="muted small">Pending / submitted</div><div class="hero">${money(sum((c) => ['pending', 'submitted'].includes(c.status)), { compact: true })}</div></div>
      <div class="card"><div class="muted small">Claims & drafts</div><div class="hero">${money(sum((c) => ['draft'].includes(c.status) || c.type === 'claim'), { compact: true })}</div></div>
      <div class="card"><div class="muted small">Time impact analysis</div><div class="small" style="margin-top:6px">Model a change as a <b>fragnet</b> (new activities tied into the live logic) and Keel measures the delay to completion — the evidence base for extension-of-time requests under NEC4 / FIDIC.</div></div>
    </div>
    <div class="card flush"><header><h3>Change register</h3>${canWrite ? `<button class="btn primary sm" id="add">${icons.plus} Change</button>` : ''}</header>
      <div class="table-wrap" style="margin-top:8px"><table class="data"><thead><tr><th>Ref</th><th>Title</th><th>Type</th><th>Status</th><th class="num">Cost</th><th class="num">Time impact</th><th>Raised</th></tr></thead><tbody>
      ${list.map((c) => `<tr class="clickable" data-id="${esc(c.id)}"><td><b>${esc(c.ref)}</b></td><td>${esc(c.title)}<div class="muted small">${esc(c.description || '')}</div></td><td>${esc(TYPES.find((t) => t[0] === c.type)?.[1] || c.type)}</td><td><span class="pill">${esc(STATUS.find((s) => s[0] === c.status)?.[1] || c.status)}</span></td><td class="num">${money(c.costImpact)}</td><td class="num">${c.impact ? `<b>${c.impact.delayDays > 0 ? '+' : ''}${c.impact.delayDays}d</b>${c.impact.floatErosion ? `<div class="muted small">−${c.impact.floatErosion}d float</div>` : ''}` : (c.fragnet || []).length ? '<span class="muted">not run</span>' : '—'}</td><td class="nowrap">${date(c.raisedDate)}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No changes recorded</td></tr>'}
      </tbody></table></div></div>
  </div>`;
  el.querySelector('#add')?.addEventListener('click', () => editChange(ctx, null));
  el.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => editChange(ctx, bundle.changes.find((c) => c.id === tr.dataset.id))));
}

async function editChange(ctx, ch) {
  const { bundle, app } = ctx;
  const canWrite = app.can('write');
  const dis = canWrite ? '' : 'disabled';
  const v = ch || { ref: `CO-${String(bundle.changes.length + 1).padStart(3, '0')}`, type: 'client-variation', status: 'draft', fragnet: [], raisedDate: bundle.project.dataDate, raisedBy: app.user.name };
  const frag = structuredClone(v.fragnet || []);
  const acts = bundle.activities.slice().sort((a, b) => String(a.code).localeCompare(String(b.code)));
  const actSel = (val, attr) => `<select ${attr} ${dis} style="max-width:200px"><option value="">—</option>${acts.map((a) => `<option value="${esc(a.id)}" ${a.id === val ? 'selected' : ''}>${esc(a.code)} ${esc(a.name.slice(0, 30))}</option>`).join('')}</select>`;
  const fragHtml = () => `<table class="data"><thead><tr><th>Code</th><th>New activity</th><th class="num">Dur</th><th>After (pred)</th><th>Before (succ)</th><th></th></tr></thead><tbody>
    ${frag.map((f, i) => `<tr><td><input data-f="code" data-i="${i}" value="${esc(f.code || '')}" style="width:80px" ${dis}></td><td><input data-f="name" data-i="${i}" value="${esc(f.name || '')}" ${dis}></td><td class="num"><input data-f="duration" data-i="${i}" type="number" value="${esc(f.duration || 0)}" style="width:60px" ${dis}></td><td>${actSel(f.predId, `data-f="predId" data-i="${i}"`)}</td><td>${actSel(f.succId, `data-f="succId" data-i="${i}"`)}</td><td>${canWrite ? `<button class="btn ghost sm" data-del="${i}">✕</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="muted small">No fragnet — add the activities this change introduces. Consecutive rows are chained finish-to-start.</td></tr>'}
  </tbody></table>${canWrite ? `<button class="btn sm" id="addfrag" style="margin-top:6px">${icons.plus} Fragnet activity</button>` : ''}`;
  const impactHtml = (imp) =>
    imp
      ? `<div class="callout ${imp.delayDays > 0 || imp.floatErosion > 0 ? 'warn' : ''}" style="margin-top:12px"><b>Time impact: ${imp.delayDays > 0 ? '+' : ''}${imp.delayDays} working days</b> (${imp.calendarDays} calendar days). Completion ${date(imp.before)} → <b>${date(imp.after)}</b>. ${imp.impactedCount} existing activities move.${imp.floatErosion ? ` <b>Float erosion ${imp.floatErosion} days</b> (worst total float ${imp.floatBefore}d → ${imp.floatAfter}d)${imp.delayDays === 0 ? ' — completion is held by a hard constraint, so the impact appears as lost float against that window.' : '.'}` : ''} Run ${esc(new Date(imp.ranAt).toLocaleString('en-GB'))}.</div>
       <div class="table-wrap" style="margin-top:8px;max-height:200px"><table class="data"><tbody>${imp.fragnet.map((f) => `<tr><td><b>${esc(f.code)}</b> ${esc(f.name)}</td><td>${date(f.start)} → ${date(f.finish)}</td><td>${f.critical ? '<b>critical</b>' : ''}</td></tr>`).join('')}${imp.impacted.slice(0, 10).map((x) => `<tr><td class="muted">${esc(x.code)} ${esc(x.name)}</td><td colspan="2" class="muted">moves +${num(x.shift)} days</td></tr>`).join('')}</tbody></table></div>`
      : '';
  const body = `<div class="form-grid">
      <label class="field">Reference<input name="ref" value="${esc(v.ref)}" ${dis}></label>
      <label class="field">Cost impact<input name="costImpact" type="number" value="${esc(v.costImpact ?? '')}" ${dis}></label>
      <label class="field full">Title<input name="title" value="${esc(v.title || '')}" ${dis}></label>
      <label class="field">Type<select name="type" ${dis}>${TYPES.map(([k, l]) => `<option value="${k}" ${k === v.type ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field">Status<select name="status" ${dis}>${STATUS.map(([k, l]) => `<option value="${k}" ${k === v.status ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field">Raised by<input name="raisedBy" value="${esc(v.raisedBy || '')}" ${dis}></label>
      <label class="field">Raised date<input name="raisedDate" type="date" value="${esc(v.raisedDate || '')}" ${dis}></label>
      <label class="field full">Description<textarea name="description" rows="2" ${dis}>${esc(v.description || '')}</textarea></label>
    </div>
    <h3 style="margin:14px 0 6px">Fragnet</h3><div id="frag">${fragHtml()}</div><div id="impact">${impactHtml(v.impact)}</div>`;

  const collect = (root) => {
    const val = (n) => root.querySelector(`[name=${n}]`).value;
    return { ref: val('ref'), title: val('title'), type: val('type'), status: val('status'), costImpact: Number(val('costImpact') || 0), raisedBy: val('raisedBy'), raisedDate: val('raisedDate') || null, description: val('description'), fragnet: frag.map((f) => ({ ...f, duration: Number(f.duration || 0), predId: f.predId || undefined, succId: f.succId || undefined })) };
  };
  let saved = ch;
  const actions = [{ label: 'Close', value: saved ? 'saved' : null }];
  if (canWrite) {
    if (ch) actions.unshift({ label: 'Delete', danger: true, handler: async () => {
      if (!(await confirmDialog('Delete change', `Delete ${ch.ref}?`, { danger: true, ok: 'Delete' }))) return false;
      await app.api.del(`changes/${ch.id}`);
      return 'deleted';
    } });
    actions.push({
      label: 'Save & run impact',
      handler: async (root) => {
        const data = collect(root);
        saved = saved ? await app.api.put(`changes/${saved.id}`, data) : await app.api.post('changes', { ...data, projectId: bundle.project.id });
        const r = await app.api.post(`changes/${saved.id}/impact`);
        root.querySelector('#impact').innerHTML = impactHtml(r.impact);
        toast(`Time impact: ${r.impact.delayDays > 0 ? '+' : ''}${r.impact.delayDays} working days`);
        return false; // keep dialog open
      },
    });
    actions.push({ label: 'Save', primary: true, handler: async (root) => {
      const data = collect(root);
      return saved ? app.api.put(`changes/${saved.id}`, data) : app.api.post('changes', { ...data, projectId: bundle.project.id });
    } });
  }
  const r = await modal({
    title: ch ? `${ch.ref} — ${ch.title}` : 'New change',
    body,
    wide: true,
    actions,
    onMount: (root) => {
      const wire = () => {
        root.querySelectorAll('[data-f]').forEach((inp) => {
          inp.onchange = () => (frag[inp.dataset.i][inp.dataset.f] = inp.value);
          inp.oninput = inp.onchange;
        });
        root.querySelectorAll('[data-del]').forEach((b) => (b.onclick = (e) => {
          e.preventDefault();
          frag.splice(Number(b.dataset.del), 1);
          root.querySelector('#frag').innerHTML = fragHtml();
          wire();
        }));
        root.querySelector('#addfrag')?.addEventListener('click', (e) => {
          e.preventDefault();
          frag.push({ code: `${root.querySelector('[name=ref]').value}-${frag.length + 1}`, name: '', duration: 10 });
          root.querySelector('#frag').innerHTML = fragHtml();
          wire();
        });
      };
      wire();
    },
  });
  if (r || saved !== ch) {
    if (r === 'deleted') toast('Change deleted');
    else if (r && r !== 'saved') toast('Change saved');
    ctx.reload();
  }
}
