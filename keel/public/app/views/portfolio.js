import { esc, money, ratio, pct, date, rag, signed, num, bindTips } from '../ui.js';

export async function render(el, _route, app, { title, actions }) {
  title.innerHTML = `<h1>Portfolio</h1><div class="muted small">${esc(app.boot.org.name)} · all live projects</div>`;
  actions.innerHTML = app.can('write') ? `<a class="btn primary" href="#/projects">New / import project</a>` : '';
  const rows = (await app.api.get('portfolio')).filter((r) => !r.project.scenarioOf);
  const live = rows.filter((r) => r.kpis);
  const sum = (k) => live.reduce((s, r) => s + (r.kpis[k] || 0), 0);
  const contract = live.reduce((s, r) => s + Number(r.project.contractValue || 0), 0);
  const bac = sum('bac');
  const ev = sum('ev');
  const ac = sum('ac');
  const pv = sum('pv');
  const counts = { red: 0, amber: 0, green: 0 };
  for (const r of live) counts[r.kpis.rag]++;

  el.innerHTML = `
  <div class="stack">
    <div class="grid g4">
      <div class="card"><div class="muted small">Portfolio contract value</div><div class="hero">${money(contract, { compact: true })}</div><div class="muted small">${live.length} live projects</div></div>
      <div class="card"><div class="muted small">Health</div>
        <div class="row" style="margin-top:10px;gap:14px">${rag('red', `${counts.red} critical`)} ${rag('amber', `${counts.amber} at risk`)} ${rag('green', `${counts.green} on track`)}</div>
        <div class="muted small" style="margin-top:10px">RAG from forecast vs target, SPI, CPI and procurement ROS.</div></div>
      <div class="card"><div class="muted small">Portfolio SPI · CPI</div><div class="hero" style="font-size:34px">${ratio(pv ? ev / pv : null)} · ${ratio(ac ? ev / ac : null)}</div><div class="muted small">Earned ${money(ev, { compact: true })} of ${money(bac, { compact: true })} budget</div></div>
      <div class="card"><div class="muted small">Open risk exposure (P × cost)</div><div class="hero" style="font-size:34px">${money(sum('riskExposure'), { compact: true })}</div><div class="muted small">${sum('highRisks')} high risks · ${sum('latePOs')} POs late to ROS</div></div>
    </div>

    <div class="card flush">
      <header><h3>Projects</h3><span class="muted small">Click a project to open its workspace</span></header>
      <div class="table-wrap" style="margin-top:8px">
      <table class="data">
        <thead><tr><th>Project</th><th>Status</th><th class="num">% complete</th><th>Forecast finish</th><th class="num">vs baseline</th><th class="num">Float to target</th><th class="num">SPI</th><th class="num">CPI</th><th class="num">EAC</th><th class="num">Critical</th><th>Headline</th></tr></thead>
        <tbody>${rows
          .map((r) => {
            if (!r.kpis) return `<tr><td>${esc(r.project.code)}</td><td colspan="10" class="muted">Could not analyse: ${esc(r.error)}</td></tr>`;
            const k = r.kpis;
            const top = r.insights[0];
            return `<tr class="clickable" data-href="#/p/${esc(r.project.id)}">
              <td><b>${esc(r.project.code)}</b><div class="muted small">${esc(r.project.name)}</div></td>
              <td>${rag(k.rag)}</td>
              <td class="num"><div>${pct(k.percentComplete)}</div><div class="progress" style="margin-top:4px"><span style="width:${Math.min(100, k.percentComplete)}%"></span></div></td>
              <td class="nowrap">${date(k.finish)}</td>
              <td class="num">${k.finishVariance === null ? '—' : signed(k.finishVariance)}</td>
              <td class="num ${k.floatToTarget !== null && k.floatToTarget < 0 ? 'status-rejected' : ''}">${k.floatToTarget === null ? '—' : signed(k.floatToTarget)}</td>
              <td class="num">${ratio(k.spi)}</td>
              <td class="num">${ratio(k.cpi)}</td>
              <td class="num">${money(k.eac, { compact: true })}</td>
              <td class="num">${num(k.critical)}${k.negativeFloat ? ` <span class="status-rejected small">(${k.negativeFloat} neg)</span>` : ''}</td>
              <td style="max-width:320px">${top ? `<span class="small">${esc(top.title)}</span>` : '<span class="muted small">—</span>'}</td>
            </tr>`;
          })
          .join('')}</tbody>
      </table></div>
    </div>

    <div class="grid g2">
      <div class="card"><header><h3>Schedule position</h3><span class="muted small">Forecast finish vs baseline and target</span></header><div id="timeline"></div></div>
      <div class="card"><header><h3>What needs attention</h3></header><div id="attention"></div></div>
    </div>
  </div>`;

  el.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', () => (location.hash = tr.dataset.href)));

  // attention list
  const items = live.flatMap((r) => r.insights.filter((i) => i.severity === 'critical' || i.severity === 'warning').map((i) => ({ ...i, project: r.project })));
  el.querySelector('#attention').innerHTML = items.length
    ? items
        .slice(0, 8)
        .map((i) => `<a class="insight ${i.severity}" href="#/p/${esc(i.project.id)}/${esc(i.tab || 'overview')}" style="color:inherit;text-decoration:none"><span class="ico">${i.severity === 'critical' ? '!' : '•'}</span><div><div class="t">${esc(i.project.code)}: ${esc(i.title)}</div>${i.detail ? `<div class="d">${esc(i.detail)}</div>` : ''}</div></a>`)
        .join('')
    : '<div class="empty">Nothing critical — all projects within tolerance.</div>';

  // dumbbell: baseline finish -> forecast finish, target marker
  const tl = el.querySelector('#timeline');
  const dates = live.flatMap((r) => [r.kpis.finish, r.kpis.baselineFinish, r.kpis.target].filter(Boolean)).map((d) => Date.parse(d));
  if (dates.length) {
    const min = Math.min(...dates) - 20 * 864e5;
    const max = Math.max(...dates) + 20 * 864e5;
    const W = Math.max(360, tl.clientWidth || 600);
    const lw = 110;
    const x = (d) => lw + ((Date.parse(d) - min) / (max - min)) * (W - lw - 20);
    let svg = `<svg class="chart" viewBox="0 0 ${W} ${live.length * 44 + 30}" width="100%" height="${live.length * 44 + 30}">`;
    const months = [];
    for (let t = new Date(min); t <= max; t.setUTCMonth(t.getUTCMonth() + 1)) months.push(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1)));
    const every = Math.max(1, Math.ceil(months.length / 6));
    months.forEach((m, i) => {
      if (i % every) return;
      const iso = m.toISOString().slice(0, 10);
      svg += `<line class="grid-line" x1="${x(iso)}" x2="${x(iso)}" y1="0" y2="${live.length * 44}"/><text x="${x(iso)}" y="${live.length * 44 + 18}" text-anchor="middle">${m.toLocaleString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })}</text>`;
    });
    live.forEach((r, i) => {
      const y = i * 44 + 22;
      const k = r.kpis;
      svg += `<text x="0" y="${y + 4}" class="label-strong">${esc(r.project.code)}</text>`;
      if (k.baselineFinish) svg += `<line x1="${x(k.baselineFinish)}" x2="${x(k.finish)}" y1="${y}" y2="${y}" stroke="var(--axis)" stroke-width="2"/>`;
      if (k.target) svg += `<path d="M${x(k.target)},${y - 10}v20" stroke="var(--ink)" stroke-width="2"/>`;
      if (k.baselineFinish) svg += `<circle cx="${x(k.baselineFinish)}" cy="${y}" r="5" fill="var(--bar-baseline)" stroke="var(--surface)" stroke-width="2"/>`;
      const col = k.rag === 'red' ? 'var(--critical)' : k.rag === 'amber' ? 'var(--warning)' : 'var(--good)';
      svg += `<g data-tip="${esc(`<div class="v">${esc(r.project.code)}</div><div class="k">Forecast ${date(k.finish)}</div><div class="k">Baseline ${date(k.baselineFinish)}</div><div class="k">Target ${date(k.target)}</div>`)}"><circle cx="${x(k.finish)}" cy="${y}" r="6" fill="${col}" stroke="var(--surface)" stroke-width="2"/><rect x="${x(k.finish) - 12}" y="${y - 12}" width="24" height="24" fill="transparent"/></g>`;
    });
    svg += '</svg>';
    tl.innerHTML = `${svg}<div class="legend"><span class="key"><span class="sw" style="background:var(--bar-baseline);border-radius:50%"></span>Baseline finish</span><span class="key"><span class="sw" style="background:var(--good);border-radius:50%"></span>Forecast finish (RAG colour)</span><span class="key"><span class="ln" style="background:var(--ink);width:2px;height:12px"></span>Contract target</span></div>`;
    bindTips(tl);
  }
}
