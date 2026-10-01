// Gantt chart: activity table (left) + SVG timeline (right) with WBS
// summaries, critical path, baseline bars, progress, milestones, the data
// date and relationship lines. Left pane scroll is synced to the timeline.

import { esc, date, showTip, hideTip, num } from './ui.js';
import { toDay, fromDay, monthLabel, fmtDate } from '../core/dates.js';

const ROW = 28;

export const ZOOMS = { week: 14, month: 4.5, quarter: 1.6 };

/**
 * rows: [{ kind: 'wbs'|'act', id, depth, code, name, start, finish, pct, critical, a, r, variance, collapsed }]
 */
export function renderGantt(el, { rows, dataDate, zoom = 'month', showBaseline = true, showLinks = false, relationships = [], selectedId = null, onSelect, onToggle, columns, levelled = null }) {
  const leftWidth = columns.reduce((s, c) => s + (parseInt(c.w, 10) || 200), 0);
  const pxd = ZOOMS[zoom] || ZOOMS.month;
  const starts = [];
  const ends = [];
  for (const r of rows) {
    if (r.start) starts.push(toDay(r.start));
    if (r.finish) ends.push(toDay(r.finish));
    if (r.blStart) starts.push(toDay(r.blStart));
    if (r.blFinish) ends.push(toDay(r.blFinish));
    if (r.lvFinish) ends.push(toDay(r.lvFinish));
  }
  const dd = toDay(dataDate);
  let d0 = Math.min(...starts, dd) - 10;
  const d1 = Math.max(...ends, dd) + 30;
  d0 = d0 - ((((d0 + 4) % 7) + 7) % 7) + 1; // align to Monday
  if (!Number.isFinite(d0) || !Number.isFinite(d1)) {
    el.innerHTML = '<div class="empty">No activities to show. Add one to start planning.</div>';
    return;
  }
  const width = Math.ceil((d1 - d0) * pxd);
  const height = rows.length * ROW;
  const x = (d) => (d - d0) * pxd;
  const cols = columns;
  const tmpl = cols.map((c) => c.w).join(' ');

  // ---- left pane -----------------------------------------------------------
  const head = `<div class="g-row g-head" style="grid-template-columns:${tmpl}">${cols.map((c) => `<div class="${c.num ? 'num' : ''}">${esc(c.label)}</div>`).join('')}</div>`;
  const leftRows = rows
    .map((r, i) => {
      const cls = r.kind === 'wbs' ? 'wbs' : `act ${r.id === selectedId ? 'sel' : ''}`;
      const cells = cols.map((c) => `<div class="${c.num ? 'num' : ''}">${c.render(r)}</div>`).join('');
      return `<div class="g-row ${cls}" data-i="${i}" data-id="${esc(r.id)}" style="grid-template-columns:${tmpl}" tabindex="${r.kind === 'act' ? 0 : -1}">${cells}</div>`;
    })
    .join('') + '<div style="height:18px"></div>';

  // ---- timeline header ----------------------------------------------------
  let hdr = `<svg width="${width}" height="44" role="presentation">`;
  for (let d = d0; d <= d1; d++) {
    const iso = fromDay(d);
    if (iso.endsWith('-01')) {
      hdr += `<line x1="${x(d)}" x2="${x(d)}" y1="0" y2="44" stroke="var(--grid)"/>`;
      if (pxd >= 1.6 || iso.slice(5, 7) % 3 === 1) hdr += `<text x="${x(d) + 4}" y="16" style="fill:var(--ink-2);font-weight:600">${monthLabel(d)}</text>`;
    }
    if (pxd >= 4 && (((d + 4) % 7) + 7) % 7 === 1) {
      hdr += `<line x1="${x(d)}" x2="${x(d)}" y1="26" y2="44" stroke="var(--grid)"/>`;
      if (pxd >= 10 || (d - d0) % 14 === 0) hdr += `<text x="${x(d) + 3}" y="39">${iso.slice(8)}</text>`;
    }
  }
  hdr += '</svg>';

  // ---- timeline body --------------------------------------------------------
  let body = `<svg width="${width}" height="${height}" role="img" aria-label="Gantt chart">`;
  // weekend shading at day zoom, month gridlines otherwise
  for (let d = d0; d <= d1; d++) {
    const iso = fromDay(d);
    if (pxd >= 10 && ((((d + 4) % 7) + 7) % 7 === 6)) body += `<rect x="${x(d)}" y="0" width="${pxd * 2}" height="${height}" fill="var(--surface-2)"/>`;
    if (iso.endsWith('-01')) body += `<line x1="${x(d)}" x2="${x(d)}" y1="0" y2="${height}" stroke="var(--grid)"/>`;
  }
  rows.forEach((r, i) => {
    if (r.id === selectedId) body += `<rect x="0" y="${i * ROW}" width="${width}" height="${ROW}" fill="var(--brand-soft)"/>`;
    body += `<line x1="0" x2="${width}" y1="${(i + 1) * ROW - 0.5}" y2="${(i + 1) * ROW - 0.5}" stroke="var(--border)"/>`;
  });
  const ddx = x(dd);
  body += `<line x1="${ddx}" x2="${ddx}" y1="0" y2="${height}" stroke="var(--s7)" stroke-width="1.5"/>`;

  const pos = new Map();
  rows.forEach((r, i) => {
    const y = i * ROW;
    if (!r.start) return;
    const s = toDay(r.start);
    const f = toDay(r.finish) + 1;
    pos.set(r.id, { y: y + ROW / 2, xs: x(s), xf: x(f) });
    const tip = esc(tipHtml(r));
    if (r.kind === 'wbs') {
      const x1 = x(s);
      const x2 = x(f);
      body += `<g class="gbar" data-tip="${tip}"><rect x="${x1}" y="${y + 11}" width="${Math.max(2, x2 - x1)}" height="5" fill="var(--bar-summary)" rx="1"/><path d="M${x1},${y + 11}v9l4,-4zM${x2},${y + 11}v9l-4,-4z" fill="var(--bar-summary)"/></g>`;
      return;
    }
    const ms = r.a.type === 'start-milestone' || r.a.type === 'finish-milestone';
    const color = r.r?.status === 'complete' ? 'var(--bar-done)' : r.critical ? 'var(--bar-critical)' : 'var(--bar)';
    if (showBaseline && r.blStart && r.blFinish) {
      const bs = x(toDay(r.blStart));
      const bf = x(toDay(r.blFinish) + (ms ? 0 : 1));
      if (ms) body += `<path d="M${bs},${y + 18}l4,4l-4,4l-4,-4z" fill="var(--bar-baseline)"/>`;
      else body += `<rect x="${bs}" y="${y + 20}" width="${Math.max(2, bf - bs)}" height="4" rx="2" fill="var(--bar-baseline)"/>`;
    }
    if (levelled && r.lvStart && r.lvStart !== r.start) {
      const ls = x(toDay(r.lvStart));
      const lf = x(toDay(r.lvFinish) + 1);
      body += `<rect x="${ls}" y="${y + 6}" width="${Math.max(2, lf - ls)}" height="12" rx="3" fill="none" stroke="var(--s4)" stroke-width="2"/>`;
    }
    if (ms) {
      const cx = r.a.type === 'finish-milestone' ? x(toDay(r.finish) + 1) : x(s);
      body += `<g class="gbar" data-id="${esc(r.id)}" data-tip="${tip}"><path d="M${cx},${y + 5}l8,8l-8,8l-8,-8z" fill="${r.r?.status === 'complete' ? 'var(--bar-done)' : r.critical ? 'var(--bar-critical)' : 'var(--ink)'}" stroke="var(--surface)" stroke-width="2"/><rect x="${cx - 12}" y="${y}" width="24" height="${ROW}" fill="transparent"/></g>`;
      pos.set(r.id, { y: y + ROW / 2, xs: cx, xf: cx });
      return;
    }
    const x1 = x(s);
    const w = Math.max(3, x(f) - x1);
    const p = Math.max(0, Math.min(100, Number(r.pct || 0)));
    body += `<g class="gbar" data-id="${esc(r.id)}" data-tip="${tip}"><rect x="${x1}" y="${y + 7}" width="${w}" height="12" rx="3" fill="${color}" ${r.r?.status === 'not-started' ? '' : ''}/>`;
    if (p > 0 && p < 100) body += `<rect x="${x1}" y="${y + 7}" width="${(w * p) / 100}" height="12" rx="3" fill="var(--ink)" opacity="0.28"/>`;
    body += `<rect x="${x1 - 2}" y="${y}" width="${w + 4}" height="${ROW}" fill="transparent"/></g>`;
  });

  if (showLinks) {
    let links = '';
    for (const rel of relationships) {
      const a = pos.get(rel.predId);
      const b = pos.get(rel.succId);
      if (!a || !b) continue;
      const t = rel.type || 'FS';
      const fromX = t === 'SS' || t === 'SF' ? a.xs : a.xf;
      const toX = t === 'FF' || t === 'SF' ? b.xf : b.xs;
      const dir = t === 'FF' || t === 'SF' ? -1 : 1;
      const midX = t === 'FS' ? Math.max(fromX + 6, Math.min(toX - 6, fromX + 6)) : fromX - 6;
      const ey = b.y + (b.y > a.y ? -6 : 6);
      links += `<path d="M${fromX},${a.y}H${midX}V${ey}H${toX - 5 * dir}" fill="none" stroke="var(--muted)" stroke-width="1" opacity="0.8"/><path d="M${toX},${ey}l${-5 * dir},-3v6z" fill="var(--muted)"/>`;
    }
    body += `<g pointer-events="none">${links}</g>`;
  }
  body += '</svg>';

  el.innerHTML = `<div class="gantt" style="--gantt-left:min(${leftWidth}px, 50%)">
    <div class="g-left"><div class="lhead">${head}</div><div class="lbody" style="height:min(${height}px, calc(100vh - 290px));min-height:${Math.min(height, 300)}px;overflow:hidden">${leftRows}</div></div>
    <div class="g-right"><div class="rhead" style="overflow:hidden;background:var(--surface-2);border-bottom:1px solid var(--border-strong)">${hdr}</div><div class="rbody" style="height:min(${height}px, calc(100vh - 290px));min-height:${Math.min(height, 300)}px;overflow:auto">${body}</div></div>
  </div>`;

  const lbody = el.querySelector('.lbody');
  const rbody = el.querySelector('.rbody');
  const rhead = el.querySelector('.rhead');
  rbody.addEventListener('scroll', () => {
    lbody.scrollTop = rbody.scrollTop;
    rhead.scrollLeft = rbody.scrollLeft;
  });
  lbody.addEventListener('wheel', (e) => {
    if (getComputedStyle(el.querySelector('.g-right')).display === 'none') return;
    rbody.scrollTop += e.deltaY;
    e.preventDefault();
  }, { passive: false });
  if (getComputedStyle(el.querySelector('.g-right')).display === 'none') lbody.style.overflow = 'auto';
  // scroll to data date minus a little
  rbody.scrollLeft = Math.max(0, ddx - rbody.clientWidth * 0.35);

  el.querySelectorAll('.g-row.act').forEach((row) => {
    const go = () => onSelect?.(row.dataset.id);
    row.addEventListener('click', go);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') go();
    });
  });
  el.querySelectorAll('.g-row.wbs').forEach((row) => row.addEventListener('click', () => onToggle?.(row.dataset.id)));
  el.querySelectorAll('.gbar').forEach((g) => {
    g.addEventListener('pointermove', (e) => showTip(g.dataset.tip, e.clientX, e.clientY));
    g.addEventListener('pointerleave', hideTip);
    if (g.dataset.id) g.addEventListener('click', () => onSelect?.(g.dataset.id));
  });
}

function tipHtml(r) {
  if (r.kind === 'wbs') {
    return `<div class="v">${esc(r.name)}</div><div class="k">${date(r.start)} → ${date(r.finish)}</div><div class="k">${num(r.pct, 0)}% complete (weighted)</div>`;
  }
  const lines = [
    `<div class="v">${esc(r.code)} · ${esc(r.name)}</div>`,
    `<div class="k">${date(r.start)} → ${date(r.finish)} · ${r.r?.remaining ?? '—'}d remaining</div>`,
    `<div class="k">Total float ${r.r?.tf ?? '—'}d · Free float ${r.r?.ff ?? '—'}d${r.critical ? ' · <b>Critical</b>' : ''}</div>`,
    `<div class="k">${num(r.pct, 0)}% complete · ${esc(r.r?.status || '')}</div>`,
  ];
  if (r.blStart) lines.push(`<div class="k">Baseline ${date(r.blStart)} → ${date(r.blFinish)}${r.variance !== null && r.variance !== undefined ? ` (${r.variance > 0 ? '+' : ''}${r.variance}d)` : ''}</div>`);
  if (r.lvStart && r.lvStart !== r.start) lines.push(`<div class="k">Levelled start ${date(r.lvStart)}</div>`);
  return lines.join('');
}

export { fmtDate };
