import { esc, num, pct } from '../../ui.js';
import { dcmaAssessment } from '../../../core/dcma.js';
import { openActivity } from './schedule.js';

export async function render(el, ctx) {
  const { bundle, an } = ctx;
  const res = dcmaAssessment({
    project: bundle.project,
    activities: bundle.activities,
    relationships: bundle.relationships,
    assignments: bundle.assignments,
    baseline: an.baseline,
    sched: an.sched,
    calendars: an.cals,
    calOf: an.calOf,
  });
  const fmt = (c) => (c.value === null ? 'n/a' : c.ratio ? c.value.toFixed(2) : c.raw ? `${c.value}d` : pct(c.value, 1));
  el.innerHTML = `<div class="stack">
    <div class="grid g3">
      <div class="card"><div class="muted small">DCMA 14-point score</div><div class="hero">${res.score}%</div><div class="muted small">${res.passed} of ${res.scored} checks passed${res.scored < 14 ? ` · ${14 - res.scored} need a baseline or target date` : ''}</div></div>
      <div class="card" style="grid-column: span 2"><h3>Why this matters</h3><p class="muted small" style="margin-top:6px">Clients and lenders increasingly require schedules that pass the US DCMA 14-point assessment before accepting a baseline or a claim. In P6 and MS Project this needs an extra licence (e.g. Acumen Fuse) — Keel runs it live on every change. Click a failing check's activity to fix it in place.</p>${an.sched.warnings.map((w) => `<div class="callout warn" style="margin-top:8px">${esc(w.message)}</div>`).join('')}</div>
    </div>
    <div class="card">${res.checks
      .map((c) => `<div class="check-row ${c.pass === null ? '' : c.pass ? 'pass' : 'fail'}">
        <span class="badge">${c.pass === null ? '–' : c.pass ? '✓' : '✕'}</span>
        <div><b>${c.id}. ${esc(c.name)}</b><div class="muted small">${esc(c.description)}</div>
          ${c.offenders?.length && !c.pass ? `<div class="small" style="margin-top:4px">${[...new Set(c.offenders)].slice(0, 12).map((id) => `<a href="#" data-act="${esc(id)}">${esc(ctx.acts.get(id)?.code || id)}</a>`).join(', ')}${c.offenders.length > 12 ? ` +${c.offenders.length - 12} more` : ''}</div>` : ''}
        </div>
        <div class="num"><b>${fmt(c)}</b></div>
        <div class="muted small hide-sm">${esc(c.threshold)}</div>
        <div class="muted small hide-sm">${c.offenders?.length ? `${num(new Set(c.offenders).size)} items` : ''}</div>
      </div>`)
      .join('')}</div>
  </div>`;
  el.querySelectorAll('[data-act]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      openActivity(ctx, a.dataset.act);
    }),
  );
}
