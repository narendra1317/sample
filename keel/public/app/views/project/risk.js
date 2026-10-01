import { esc, money, num, pct, date, formDialog, confirmDialog, toast, icons } from '../../ui.js';
import { columnChart, hbarChart } from '../../charts.js';
import { simulate } from '../../../core/montecarlo.js';
import { riskScore } from '../../../core/analysis.js';
import { fmtDate } from '../../../core/dates.js';

const STATUS = [['open', 'Open'], ['mitigating', 'Mitigating'], ['occurred', 'Occurred (issue)'], ['closed', 'Closed']];
const RESPONSE = [['reduce', 'Reduce / mitigate'], ['avoid', 'Avoid'], ['transfer', 'Transfer'], ['accept', 'Accept'], ['exploit', 'Exploit (opportunity)']];

export async function render(el, ctx) {
  const { bundle, app, ui, an } = ctx;
  const risks = [...bundle.risks].sort((a, b) => riskScore(b) - riskScore(a));
  const acts = ctx.acts;
  const canWrite = app.can('write');
  const scoreCls = (s) => (s >= 15 ? 'red' : s >= 8 ? 'amber' : 'green');

  // 5x5 matrix counts
  const band = (r) => {
    const p = Number(r.probability || 0);
    const pb = p >= 0.7 ? 5 : p >= 0.5 ? 4 : p >= 0.3 ? 3 : p >= 0.1 ? 2 : 1;
    return [pb, Math.max(1, Math.round(riskScore(r) / pb))];
  };
  const cells = {};
  for (const r of risks.filter((x) => x.status !== 'closed')) {
    const [pb, ib] = band(r);
    const k = `${pb}-${Math.min(5, ib)}`;
    cells[k] = cells[k] || [];
    cells[k].push(r.code);
  }
  const matrix = `<table class="heat" aria-label="Risk matrix"><tbody>${[5, 4, 3, 2, 1]
    .map((pb) => `<tr><th class="small">${['', 'Rare', 'Unlikely', 'Possible', 'Likely', 'Almost certain'][pb]}</th>${[1, 2, 3, 4, 5]
      .map((ib) => {
        const s = pb * ib;
        const bg = s >= 15 ? 'var(--critical)' : s >= 8 ? 'var(--warning)' : 'var(--good)';
        const list = cells[`${pb}-${ib}`] || [];
        return `<td class="cell" style="background:${bg};opacity:${list.length ? 1 : 0.35};color:${s >= 8 && s < 15 ? '#3d2b00' : '#fff'}" title="${esc(list.join(', '))}">${list.length || ''}</td>`;
      })
      .join('')}</tr>`)
    .join('')}<tr><th></th>${['Minor', 'Moderate', 'Serious', 'Major', 'Severe'].map((x) => `<th class="small">${x}</th>`).join('')}</tr></tbody></table><div class="muted small">Probability (rows) × impact (columns). Cell = number of open risks.</div>`;

  el.innerHTML = `<div class="stack">
    <div class="grid g-2-1">
      <div class="card flush"><header><h3>Risk register</h3>${canWrite ? `<button class="btn primary sm" id="add">${icons.plus} Risk</button>` : ''}</header>
        <div class="table-wrap" style="margin-top:8px"><table class="data"><thead><tr><th>ID</th><th>Risk</th><th>Owner</th><th class="num">P</th><th class="num">Days</th><th class="num">Cost</th><th class="num">Score</th><th>Status</th><th>Linked</th></tr></thead><tbody>
        ${risks.map((r) => `<tr class="clickable" data-id="${esc(r.id)}"><td class="nowrap"><b>${esc(r.code)}</b></td><td>${esc(r.title)}<div class="muted small">${esc(r.category || '')}${r.mitigation ? ` · ${esc(r.mitigation)}` : ''}</div></td><td class="nowrap">${esc(r.owner || '')}</td><td class="num">${pct(r.probability * 100)}</td><td class="num">${num(r.impactDays)}</td><td class="num">${money(r.impactCost, { compact: true })}</td><td class="num"><span class="pill rag-${scoreCls(riskScore(r))}"><span class="dot"></span>${riskScore(r)}</span></td><td>${esc(r.status)}</td><td class="small">${(r.activityIds || []).map((id) => esc(acts.get(id)?.code || '')).join(', ')}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">No risks recorded</td></tr>'}
        </tbody></table></div></div>
      <div class="card"><header><h3>Risk matrix</h3></header>${matrix}</div>
    </div>
    <div class="card"><header><h3>Quantitative schedule risk analysis (Monte Carlo)</h3></header>
      <p class="muted small">Samples every remaining activity duration from its three-point estimate (optimistic / most likely / pessimistic — default −10% / +25% where not set) and fires each open, schedule-linked risk by its probability, then re-runs the full CPM for every iteration.</p>
      <div class="row" style="margin:10px 0">
        <label class="field">Iterations<select id="iters"><option>500</option><option selected>1000</option><option>3000</option></select></label>
        <label class="field">Distribution<select id="dist"><option value="triangular">Triangular</option><option value="pert">Beta-PERT</option></select></label>
        <label class="field">Default optimistic %<input id="low" type="number" value="90" style="width:80px"></label>
        <label class="field">Default pessimistic %<input id="high" type="number" value="125" style="width:80px"></label>
        <button class="btn primary" id="run" style="align-self:flex-end">Run simulation</button>
      </div>
      <div id="qsra">${ui.qsra ? '' : '<div class="empty">Run the simulation to see P50 / P80 dates, criticality and the risk drivers.</div>'}</div>
    </div>
  </div>`;

  el.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => canWrite && editRisk(ctx, bundle.risks.find((r) => r.id === tr.dataset.id))));
  el.querySelector('#add')?.addEventListener('click', () => editRisk(ctx, null));
  const run = () => {
    const out = el.querySelector('#qsra');
    out.innerHTML = '<div class="empty">Simulating…</div>';
    setTimeout(() => {
      const t0 = performance.now();
      ui.qsra = simulate({
        project: bundle.project,
        activities: bundle.activities,
        relationships: bundle.relationships,
        calendars: an.cals,
        risks: bundle.risks,
        iterations: Number(el.querySelector('#iters').value),
        distribution: el.querySelector('#dist').value,
        defaults: { low: Number(el.querySelector('#low').value) / 100, high: Number(el.querySelector('#high').value) / 100 },
      });
      ui.qsra.ms = Math.round(performance.now() - t0);
      drawQsra(el.querySelector('#qsra'), ctx);
    }, 30);
  };
  el.querySelector('#run').onclick = run;
  if (ui.qsra) drawQsra(el.querySelector('#qsra'), ctx);
}

function drawQsra(host, ctx) {
  const q = ctx.ui.qsra;
  const acts = ctx.acts;
  const crit = [...q.criticality.entries()]
    .filter(([id, v]) => v > 0.05 && acts.get(id) && acts.get(id).type !== 'start-milestone' && acts.get(id).type !== 'finish-milestone')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  const kpi = (l, v, d = '') => `<div class="kpi"><div class="label">${l}</div><div class="value" style="font-size:18px">${v}</div>${d ? `<div class="delta">${d}</div>` : ''}</div>`;
  host.innerHTML = `<div class="kpis">
      ${kpi('Deterministic (CPM)', date(q.deterministic), `${pct(q.probDeterministic * 100)} chance of achieving`)}
      ${kpi('P50', date(q.p50))}
      ${kpi('P80', date(q.p80), 'Typical sanction / contract date')}
      ${kpi('P90', date(q.p90))}
      ${q.target ? kpi('Target', date(q.target), `<b>${pct(q.probOnTime * 100)}</b> probability of meeting it`) : ''}
      ${kpi('Range', `${date(q.earliest)} – ${date(q.latest)}`, `${num(q.iterations)} iterations in ${num(q.ms)} ms`)}
    </div>
    <div class="grid g2" style="margin-top:16px">
      <div><h4>Completion date distribution</h4><div id="hist"></div></div>
      <div><h4>Duration sensitivity (correlation with finish)</h4><div id="tornado"></div></div>
      <div><h4>Criticality index</h4><div class="muted small">Share of iterations each activity sat on the driving path</div><div id="crit"></div></div>
      <div><h4>Risk drivers</h4><div class="table-wrap"><table class="data"><thead><tr><th>Risk</th><th class="num">Fired</th><th class="num">Avg impact</th><th class="num">Correlation</th></tr></thead><tbody>${q.riskRanking.map((r) => `<tr><td><b>${esc(r.code)}</b> ${esc(r.title)}</td><td class="num">${pct(r.hitRate * 100)}</td><td class="num">${num(r.avgImpactDays, 1)}d</td><td class="num">${r.correlation.toFixed(2)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No open risks linked to activities with schedule impact.</td></tr>'}</tbody></table></div></div>
    </div>`;
  columnChart(host.querySelector('#hist'), {
    categories: q.histogram.map((b) => b.from),
    stacks: [{ name: 'Iterations', color: 'var(--s1)', values: q.histogram.map((b) => b.count) }],
    yFormat: (v) => num(v),
    catFormat: (d) => fmtDate(d).slice(0, 9),
    tipTitle: (d) => {
      const b = q.histogram.find((x) => x.from === d);
      return `${fmtDate(b.from)} – ${fmtDate(b.to)} · cumulative ${Math.round(b.cum * 100)}%`;
    },
    height: 220,
  });
  hbarChart(host.querySelector('#tornado'), { rows: q.sensitivity.slice(0, 10).map((s) => ({ label: `${s.code} ${s.name}`, value: s.correlation })), format: (v) => v.toFixed(2), max: 1 });
  hbarChart(host.querySelector('#crit'), { rows: crit.map(([id, v]) => ({ label: `${acts.get(id).code} ${acts.get(id).name}`, value: v * 100, color: v > 0.6 ? 'var(--critical)' : 'var(--s1)' })), format: (v) => `${Math.round(v)}%`, max: 100 });
}

async function editRisk(ctx, risk) {
  const { bundle, app } = ctx;
  const acts = bundle.activities.filter((a) => a.type !== 'start-milestone');
  const fields = [
    { name: 'code', label: 'Risk ID', required: true },
    { name: 'title', label: 'Title', required: true },
    { name: 'category', label: 'Category' },
    { name: 'owner', label: 'Owner' },
    { name: 'probability', label: 'Probability (0–1)', type: 'number', step: '0.05', min: 0, max: 1 },
    { name: 'impactDays', label: 'Schedule impact (working days)', type: 'number' },
    { name: 'impactCost', label: 'Cost impact', type: 'number' },
    { name: 'status', label: 'Status', type: 'select', options: STATUS },
    { name: 'response', label: 'Response', type: 'select', options: RESPONSE },
    { name: 'cause', label: 'Cause' },
    { name: 'mitigation', label: 'Mitigation / actions', type: 'textarea', full: true },
  ];
  const linked = new Set(risk?.activityIds || []);
  const extra = `<label class="field" style="margin-top:12px">Activities impacted if the risk occurs <span class="hint">(used by the Monte Carlo simulation)</span>
    <select name="activityIds" multiple size="8">${acts.map((a) => `<option value="${esc(a.id)}" ${linked.has(a.id) ? 'selected' : ''}>${esc(a.code)} — ${esc(a.name)}</option>`).join('')}</select></label>`;
  const res = await formDialog({
    title: risk ? `Edit ${risk.code}` : 'New risk',
    wide: true,
    fields,
    values: risk || { code: `R-${String(bundle.risks.length + 1).padStart(3, '0')}`, probability: 0.3, status: 'open', response: 'reduce' },
    extraHtml: extra + (risk ? '<div class="row" style="margin-top:12px"><button class="btn danger sm" id="delrisk" type="button">Delete risk</button></div>' : ''),
    onMount: (root, close) => {
      root.querySelector('#delrisk')?.addEventListener('click', async () => {
        if (!(await confirmDialog('Delete risk', `Delete ${risk.code} ${risk.title}?`, { danger: true, ok: 'Delete' }))) return;
        await app.api.del(`risks/${risk.id}`);
        close('deleted');
      });
    },
    onSubmit: async (d, root) => {
      d.activityIds = [...root.querySelector('[name=activityIds]').selectedOptions].map((o) => o.value);
      return risk ? app.api.put(`risks/${risk.id}`, d) : app.api.post('risks', { ...d, projectId: bundle.project.id });
    },
  });
  if (res) {
    toast(res === 'deleted' ? 'Risk deleted' : 'Risk saved');
    ctx.ui.qsra = null;
    ctx.reload();
  }
}
