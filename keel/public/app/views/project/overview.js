import { esc, money, ratio, pct, date, signed, num } from '../../ui.js';
import { lineChart, hbarChart } from '../../charts.js';
import { isMilestone } from '../../../core/cpm.js';

export async function render(el, ctx) {
  const { an, bundle, insights, project } = ctx;
  const k = an.kpis;
  const e = an.evm;
  const kpi = (label, value, delta = '', cls = '') => `<div class="kpi"><div class="label">${label}</div><div class="value">${value}</div>${delta ? `<div class="delta ${cls}">${delta}</div>` : ''}</div>`;

  const milestones = bundle.activities
    .filter((a) => isMilestone(a))
    .map((a) => ({ a, r: an.sched.byId.get(a.id), v: an.variance.get(a.id) }))
    .sort((x, y) => x.r.es - y.r.es);

  const phases = { PM: 'Management', E: 'Engineering', P: 'Procurement', C: 'Construction', CS: 'Commissioning' };
  const phaseRows = Object.entries(phases)
    .map(([key, label]) => {
      const acts = bundle.activities.filter((a) => (a.phase || '') === key && a.type !== 'loe');
      const w = acts.reduce((s, a) => s + (e.budgets.get(a.id)?.total || 0), 0);
      if (!w) return null;
      const earned = acts.reduce((s, a) => s + ((e.budgets.get(a.id)?.total || 0) * (e.pctById.get(a.id) || 0)) / 100, 0);
      return { label, value: (100 * earned) / w, tip: `${label}: ${money(earned, { compact: true })} earned of ${money(w, { compact: true })}` };
    })
    .filter(Boolean);

  el.innerHTML = `<div class="stack">
    <div class="kpis">
      ${kpi('Forecast finish', date(k.finish), k.baselineFinish ? `Baseline ${date(k.baselineFinish)} (${signed(k.finishVariance)})` : 'No baseline', k.finishVariance > 5 ? 'bad' : k.finishVariance <= 0 ? 'good' : '')}
      ${kpi('Float to target', k.floatToTarget === null ? '—' : `${k.floatToTarget}d`, k.target ? `Target ${date(k.target)}` : 'Set a must-finish date', k.floatToTarget !== null && k.floatToTarget < 0 ? 'bad' : 'good')}
      ${kpi('Physical progress', pct(k.percentComplete, 1), `Planned ${pct(e.bac ? (100 * e.pv) / e.bac : 0, 1)}`, k.percentComplete < (100 * e.pv) / (e.bac || 1) - 2 ? 'bad' : 'good')}
      ${kpi('SPI', ratio(k.spi), `SPI(t) ${ratio(k.spiT)}${e.earnedScheduleDate ? ` · earned to ${date(e.earnedScheduleDate)}` : ''}`, k.spi !== null && k.spi < 0.95 ? 'bad' : 'good')}
      ${kpi('CPI', ratio(k.cpi), `AC ${money(k.ac, { compact: true })} for EV ${money(k.ev, { compact: true })}`, k.cpi !== null && k.cpi < 0.95 ? 'bad' : 'good')}
      ${kpi('EAC', money(k.eac, { compact: true }), `BAC ${money(k.bac, { compact: true })} · VAC ${money(e.vac, { compact: true })}`, e.vac < 0 ? 'bad' : 'good')}
      ${kpi('Critical activities', num(k.critical), k.negativeFloat ? `${k.negativeFloat} with negative float` : `${k.inProgress} in progress`, k.negativeFloat ? 'bad' : '')}
    </div>
    <div class="grid g-2-1">
      <div class="card"><header><h3>S-curve</h3><span class="muted small">Cumulative cost · baseline plan vs earned vs actual</span></header><div id="scurve"></div></div>
      <div class="card"><header><h3>Project intelligence</h3><span class="muted small">Auto-generated from the live data</span></header>
        ${insights.length ? insights.map((i) => `<a class="insight ${i.severity}" href="#/p/${esc(project.id)}/${esc(i.tab || 'overview')}" style="color:inherit;text-decoration:none"><span class="ico">${i.severity === 'critical' ? '!' : i.severity === 'good' ? '✓' : i.severity === 'info' ? 'i' : '•'}</span><div><div class="t">${esc(i.title)}</div>${i.detail ? `<div class="d">${esc(i.detail)}</div>` : ''}</div></a>`).join('') : '<div class="empty">No issues detected.</div>'}
      </div>
    </div>
    <div class="grid g2">
      <div class="card"><header><h3>Key milestones</h3></header>
        <div class="table-wrap"><table class="data"><thead><tr><th>Milestone</th><th>Baseline</th><th>Forecast / actual</th><th class="num">Var</th><th class="num">Float</th></tr></thead><tbody>
        ${milestones
          .map(({ a, r, v }) => `<tr><td><b>${esc(a.code)}</b> ${esc(a.name)}</td><td class="nowrap">${date(v?.blFinish)}</td><td class="nowrap">${r.status === 'complete' ? `<span class="status-approved">✓ ${date(r.finish)}</span>` : date(r.finish)}</td><td class="num ${v?.finish > 0 ? 'status-rejected' : ''}">${v?.finish === null || v?.finish === undefined ? '—' : signed(v.finish)}</td><td class="num ${r.tf !== null && r.tf < 0 ? 'status-rejected' : ''}">${r.tf ?? '—'}</td></tr>`)
          .join('') || '<tr><td colspan="5" class="muted">No milestones defined</td></tr>'}
        </tbody></table></div></div>
      <div class="card"><header><h3>Progress by phase</h3><span class="muted small">Earned % of phase budget</span></header><div id="phases"></div>
        <div class="grid g3" style="margin-top:14px">
          <div><div class="muted small">Open risks</div><div style="font-size:20px;font-weight:600">${k.openRisks}</div><div class="muted small">${money(k.riskExposure, { compact: true })} exposure</div></div>
          <div><div class="muted small">MDR overdue</div><div style="font-size:20px;font-weight:600">${k.overdueDocs}</div><div class="muted small">of ${bundle.deliverables.length} deliverables</div></div>
          <div><div class="muted small">POs late to ROS</div><div style="font-size:20px;font-weight:600">${k.latePOs}</div><div class="muted small">of ${bundle.procurement.length} packages</div></div>
        </div>
      </div>
    </div>
    ${project.history?.length ? `<div class="card"><header><h3>Period history</h3><span class="muted small">Snapshots taken at each period close</span></header><div class="table-wrap"><table class="data"><thead><tr><th>Data date</th><th>Closed by</th><th class="num">% complete</th><th class="num">SPI</th><th class="num">CPI</th><th>Forecast finish</th></tr></thead><tbody>${project.history
      .slice()
      .reverse()
      .map((h) => `<tr><td>${date(h.dataDate)}</td><td>${esc(h.closedBy)}</td><td class="num">${pct(h.pct, 1)}</td><td class="num">${ratio(h.spi)}</td><td class="num">${ratio(h.cpi)}</td><td>${date(h.finish)}</td></tr>`)
      .join('')}</tbody></table></div></div>` : ''}
  </div>`;

  const series = e.series;
  lineChart(el.querySelector('#scurve'), {
    height: 280,
    yFormat: (v) => money(v, { compact: true }),
    markers: [{ x: project.dataDate, label: 'Data date' }],
    series: [
      { name: 'Planned value (baseline)', color: 'var(--s1)', points: series.map((p) => ({ x: p.week, y: p.pv })) },
      { name: 'Earned value', color: 'var(--s2)', points: series.filter((p) => p.ev !== undefined).map((p) => ({ x: p.week, y: p.ev })) },
      { name: 'Actual cost', color: 'var(--s3)', points: series.filter((p) => p.ac !== undefined).map((p) => ({ x: p.week, y: p.ac })) },
      { name: 'Forecast cost (EAC)', color: 'var(--s4)', points: series.filter((p) => p.forecast !== undefined).map((p) => ({ x: p.week, y: p.forecast })) },
    ],
  });
  if (phaseRows.length) hbarChart(el.querySelector('#phases'), { rows: phaseRows, format: (v) => pct(v), max: 100, labelWidth: 130 });
  else el.querySelector('#phases').innerHTML = '<div class="empty">Tag activities with a phase and load budgets to see this.</div>';
}
