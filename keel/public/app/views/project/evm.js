import { esc, money, ratio, pct, num, date, tableHtml, makeSortable } from '../../ui.js';
import { lineChart, columnChart } from '../../charts.js';
import { fmtDate, weekStartDay, fromDay } from '../../../core/dates.js';

export async function render(el, ctx) {
  const { an, bundle, app } = ctx;
  const e = an.evm;
  const resById = new Map(app.boot.resources.map((r) => [r.id, r]));
  const acByAct = new Map();
  for (const en of an.entries) acByAct.set(en.activityId, (acByAct.get(en.activityId) || 0) + en.hours * (resById.get(en.resourceId)?.rate || 0));
  for (const a of bundle.activities) acByAct.set(a.id, (acByAct.get(a.id) || 0) + Number(a.actualCost || 0));

  const eacTypical = e.eac;
  const eacAtypical = e.ac + (e.bac - e.ev);
  const eacComposite = e.cpi && e.spi ? e.ac + (e.bac - e.ev) / (e.cpi * e.spi) : null;

  // top-level WBS breakdown
  const parentOf = new Map(bundle.wbs.map((w) => [w.id, w.parentId]));
  const topOf = (wid) => {
    let cur = wid;
    const seen = new Set();
    while (cur && parentOf.get(cur) && !seen.has(cur)) {
      seen.add(cur);
      cur = parentOf.get(cur);
    }
    return cur || null;
  };
  const groups = new Map();
  for (const a of bundle.activities) {
    const k = topOf(a.wbsId);
    if (!groups.has(k)) groups.set(k, { bac: 0, ev: 0, ac: 0 });
    const g = groups.get(k);
    const b = an.baseline?.activities?.[a.id]?.budget ?? e.budgets.get(a.id)?.total ?? 0;
    g.bac += b;
    g.ev += (b * (e.pctById.get(a.id) || 0)) / 100;
    g.ac += acByAct.get(a.id) || 0;
  }
  const wbsName = (id) => {
    const w = bundle.wbs.find((x) => x.id === id);
    return w ? `${w.code || ''} ${w.name}` : 'Unassigned';
  };
  const wbsRows = [...groups.entries()].map(([id, g]) => ({ name: wbsName(id), ...g, cpi: g.ac ? g.ev / g.ac : null, pct: g.bac ? (100 * g.ev) / g.bac : 0 })).filter((x) => x.bac || x.ac);

  // weekly hours: planned (baseline) vs actual
  const hoursByWeek = new Map();
  for (const en of an.entries) {
    const w = fromDay(weekStartDay(en.day));
    hoursByWeek.set(w, (hoursByWeek.get(w) || 0) + en.hours);
  }
  const weeks = [...hoursByWeek.keys()].sort().slice(-26);

  const row = (label, value, note = '') => `<tr><td>${label}</td><td class="num"><b>${value}</b></td><td class="muted small">${note}</td></tr>`;
  el.innerHTML = `<div class="stack">
    <div class="grid g-2-1">
      <div class="card"><header><h3>Cost S-curve</h3><span class="muted small">Baseline ${esc(an.baseline?.name || '(none — current plan used)')}</span></header><div id="s"></div></div>
      <div class="card"><header><h3>Performance at ${date(bundle.project.dataDate)}</h3></header>
        <table class="data"><tbody>
          ${row('Budget at completion (BAC)', money(e.bac))}
          ${row('Planned value (PV)', money(e.pv), pct(e.bac ? (100 * e.pv) / e.bac : 0, 1) + ' planned')}
          ${row('Earned value (EV)', money(e.ev), pct(e.percentComplete, 1) + ' complete')}
          ${row('Actual cost (AC)', money(e.ac), 'approved timesheets × rates + non-labour actuals')}
          ${row('Schedule variance (SV)', money(e.sv))}
          ${row('Cost variance (CV)', money(e.cv))}
          ${row('SPI · SPI(t)', `${ratio(e.spi)} · ${ratio(e.spiT)}`, 'SPI(t) = earned schedule, reliable late in the project')}
          ${row('CPI', ratio(e.cpi))}
          ${row('TCPI (to BAC)', ratio(e.tcpi), 'efficiency needed on remaining work')}
          ${row('EAC — CPI method', money(eacTypical), 'AC + (BAC − EV) ÷ CPI')}
          ${row('EAC — atypical', money(eacAtypical), 'AC + (BAC − EV)')}
          ${row('EAC — CPI × SPI', money(eacComposite), 'when schedule pressure drives cost')}
          ${row('Variance at completion', money(e.vac))}
        </tbody></table>
      </div>
    </div>
    <div class="grid g2">
      <div class="card flush"><header><h3>By top-level WBS</h3></header>${tableHtml(wbsRows, [
        { label: 'WBS', render: (x) => esc(x.name) },
        { label: 'BAC', num: true, render: (x) => money(x.bac, { compact: true }) },
        { label: 'EV', num: true, render: (x) => money(x.ev, { compact: true }) },
        { label: 'AC', num: true, render: (x) => money(x.ac, { compact: true }) },
        { label: '% earned', num: true, render: (x) => pct(x.pct) },
        { label: 'CPI', num: true, render: (x) => `<span class="${x.cpi !== null && x.cpi < 0.95 ? 'status-rejected' : ''}">${ratio(x.cpi)}</span>` },
      ])}</div>
      <div class="card"><header><h3>Hours booked per week</h3><span class="muted small">Approved timesheets, last 26 weeks</span></header><div id="hours"></div></div>
    </div>
  </div>`;
  makeSortable(el);
  lineChart(el.querySelector('#s'), {
    height: 300,
    yFormat: (v) => money(v, { compact: true }),
    markers: [{ x: bundle.project.dataDate, label: 'Data date' }],
    series: [
      { name: 'Planned value', color: 'var(--s1)', points: e.series.map((p) => ({ x: p.week, y: p.pv })) },
      { name: 'Earned value', color: 'var(--s2)', points: e.series.filter((p) => p.ev !== undefined).map((p) => ({ x: p.week, y: p.ev })) },
      { name: 'Actual cost', color: 'var(--s3)', points: e.series.filter((p) => p.ac !== undefined).map((p) => ({ x: p.week, y: p.ac })) },
      { name: 'Forecast (EAC)', color: 'var(--s4)', points: e.series.filter((p) => p.forecast !== undefined).map((p) => ({ x: p.week, y: p.forecast })) },
    ],
  });
  if (weeks.length) {
    columnChart(el.querySelector('#hours'), {
      categories: weeks,
      stacks: [{ name: 'Hours', color: 'var(--s1)', values: weeks.map((w) => hoursByWeek.get(w)) }],
      yFormat: (v) => `${num(v)}h`,
      catFormat: (w) => fmtDate(w).slice(0, 6),
      tipTitle: (w) => `w/c ${fmtDate(w)}`,
      height: 240,
    });
  } else el.querySelector('#hours').innerHTML = '<div class="empty">No approved hours yet.</div>';
}
