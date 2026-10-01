// Hand-rolled SVG charts (no dependencies). Follows the house viz rules:
// thin marks, 2px lines, rounded data-ends, hairline grid, one y-axis,
// legend for 2+ series, hover layer on every chart.

import { esc, showTip, hideTip } from './ui.js';
import { toDay, fromDay, monthLabel, fmtDate } from '../core/dates.js';

const niceStep = (range, target = 5) => {
  const raw = range / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
};

function yTicks(min, max) {
  if (max === min) max = min + 1;
  const step = niceStep(max - min);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { lo, hi, ticks };
}

function legendHtml(items) {
  if (items.length < 2) return '';
  return `<div class="legend">${items
    .map((s) => `<span class="key"><span class="${s.kind === 'line' ? 'ln' : 'sw'}" style="background:${s.color}"></span>${esc(s.name)}</span>`)
    .join('')}</div>`;
}

/**
 * Time-series line chart with crosshair tooltip.
 * series: [{ name, color, points: [{ x: isoDate, y }] }]
 * markers: [{ x: isoDate, label }]
 */
export function lineChart(el, { series, height = 260, yFormat = (v) => v, markers = [], area = false, title = '' }) {
  const width = Math.max(320, el.clientWidth || 720);
  const pad = { l: 64, r: 16, t: 12, b: 28 };
  const all = series.flatMap((s) => s.points.filter((p) => p.y !== null && p.y !== undefined));
  if (!all.length) {
    el.innerHTML = '<div class="empty">No data yet</div>';
    return;
  }
  const xs = all.map((p) => toDay(p.x));
  const x0 = Math.min(...xs, ...markers.map((m) => toDay(m.x)));
  const x1 = Math.max(...xs, ...markers.map((m) => toDay(m.x)));
  const { lo, hi, ticks } = yTicks(Math.min(0, ...all.map((p) => p.y)), Math.max(...all.map((p) => p.y)));
  const W = width - pad.l - pad.r;
  const H = height - pad.t - pad.b;
  const sx = (d) => pad.l + ((d - x0) / Math.max(1, x1 - x0)) * W;
  const sy = (v) => pad.t + H - ((v - lo) / (hi - lo)) * H;

  let svg = `<svg class="chart" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="${esc(title || series.map((s) => s.name).join(', '))}">`;
  for (const t of ticks) svg += `<line class="grid-line" x1="${pad.l}" x2="${width - pad.r}" y1="${sy(t)}" y2="${sy(t)}"/><text x="${pad.l - 8}" y="${sy(t) + 4}" text-anchor="end">${esc(yFormat(t))}</text>`;
  // month ticks
  const months = [];
  for (let d = x0; d <= x1; d++) {
    const iso = fromDay(d);
    if (iso.endsWith('-01')) months.push(d);
  }
  const every = Math.max(1, Math.ceil(months.length / Math.floor(W / 64)));
  months.forEach((d, i) => {
    if (i % every) return;
    svg += `<line class="axis-line" x1="${sx(d)}" x2="${sx(d)}" y1="${pad.t + H}" y2="${pad.t + H + 4}"/><text x="${sx(d)}" y="${height - 8}" text-anchor="middle">${monthLabel(d)}</text>`;
  });
  svg += `<line class="axis-line" x1="${pad.l}" x2="${width - pad.r}" y1="${sy(Math.max(lo, 0))}" y2="${sy(Math.max(lo, 0))}"/>`;
  for (const m of markers) {
    const x = sx(toDay(m.x));
    svg += `<line x1="${x}" x2="${x}" y1="${pad.t}" y2="${pad.t + H}" stroke="var(--ink-2)" stroke-width="1"/><text x="${x + 4}" y="${pad.t + 10}" class="label-strong">${esc(m.label)}</text>`;
  }
  for (const s of series) {
    const pts = s.points.filter((p) => p.y !== null && p.y !== undefined);
    if (!pts.length) continue;
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(toDay(p.x)).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
    if (area) svg += `<path d="${d}L${sx(toDay(pts[pts.length - 1].x))},${sy(Math.max(lo, 0))}L${sx(toDay(pts[0].x))},${sy(Math.max(lo, 0))}Z" fill="${s.color}" opacity="0.1"/>`;
    svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" ${s.faded ? 'opacity="0.75"' : ''}/>`;
    const last = pts[pts.length - 1];
    svg += `<circle cx="${sx(toDay(last.x))}" cy="${sy(last.y)}" r="4" fill="${s.color}" stroke="var(--surface)" stroke-width="2"/>`;
  }
  svg += `<line class="xhair" x1="0" x2="0" y1="${pad.t}" y2="${pad.t + H}" stroke="var(--ink-2)" stroke-width="1" visibility="hidden"/>`;
  svg += `<rect class="hit" x="${pad.l}" y="${pad.t}" width="${W}" height="${H}" fill="transparent"/>`;
  svg += '</svg>';
  el.innerHTML = svg + legendHtml(series.map((s) => ({ ...s, kind: 'line' })));

  const root = el.querySelector('svg');
  const hit = root.querySelector('.hit');
  const xh = root.querySelector('.xhair');
  const xsAll = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort();
  hit.addEventListener('pointermove', (e) => {
    const r = root.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * width;
    const day = x0 + ((px - pad.l) / W) * (x1 - x0);
    let best = xsAll[0];
    for (const x of xsAll) if (Math.abs(toDay(x) - day) < Math.abs(toDay(best) - day)) best = x;
    const X = sx(toDay(best));
    xh.setAttribute('x1', X);
    xh.setAttribute('x2', X);
    xh.setAttribute('visibility', 'visible');
    const rows = series
      .map((s) => {
        const p = s.points.find((q) => q.x === best);
        if (!p || p.y === null || p.y === undefined) return '';
        return `<div><span class="line" style="background:${s.color}"></span><span class="v">${esc(yFormat(p.y))}</span> <span class="k">${esc(s.name)}</span></div>`;
      })
      .join('');
    showTip(`<div class="k">w/c ${esc(fmtDate(best))}</div>${rows}`, e.clientX, e.clientY);
  });
  hit.addEventListener('pointerleave', () => {
    xh.setAttribute('visibility', 'hidden');
    hideTip();
  });
}

/**
 * Column chart (optionally stacked) with an optional reference line (e.g. capacity).
 * categories: [label]; stacks: [{ name, color, values: [] }]; ref: { name, values: [] }
 */
export function columnChart(el, { categories, stacks, ref, height = 240, yFormat = (v) => v, catFormat = (c) => c, tipTitle = (c) => c, highlight = null }) {
  const width = Math.max(320, el.clientWidth || 720);
  const pad = { l: 56, r: 12, t: 12, b: 30 };
  const totals = categories.map((_, i) => stacks.reduce((s, st) => s + (st.values[i] || 0), 0));
  const maxV = Math.max(1, ...totals, ...(ref ? ref.values : []));
  const { hi, ticks } = yTicks(0, maxV);
  const W = width - pad.l - pad.r;
  const H = height - pad.t - pad.b;
  const band = W / Math.max(1, categories.length);
  const bw = Math.min(24, band * 0.7);
  const sy = (v) => pad.t + H - (v / hi) * H;
  let svg = `<svg class="chart" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img">`;
  for (const t of ticks) svg += `<line class="grid-line" x1="${pad.l}" x2="${width - pad.r}" y1="${sy(t)}" y2="${sy(t)}"/><text x="${pad.l - 8}" y="${sy(t) + 4}" text-anchor="end">${esc(yFormat(t))}</text>`;
  const labelEvery = Math.max(1, Math.ceil(categories.length / Math.floor(W / 56)));
  categories.forEach((c, i) => {
    const cx = pad.l + band * i + band / 2;
    let y = sy(0);
    const segs = stacks.filter((s) => s.values[i] > 0);
    segs.forEach((s, j) => {
      const h = (s.values[i] / hi) * H;
      const top = j === segs.length - 1;
      const gap = j > 0 ? 2 : 0;
      const hh = Math.max(0, h - gap);
      const yTop = y - h;
      if (top && hh > 4) {
        const r = 4;
        svg += `<path d="M${cx - bw / 2},${y - gap}V${yTop + r}Q${cx - bw / 2},${yTop} ${cx - bw / 2 + r},${yTop}H${cx + bw / 2 - r}Q${cx + bw / 2},${yTop} ${cx + bw / 2},${yTop + r}V${y - gap}Z" fill="${s.color}"/>`;
      } else svg += `<rect x="${cx - bw / 2}" y="${yTop}" width="${bw}" height="${hh}" fill="${s.color}"/>`;
      y = yTop;
    });
    if (highlight !== null && highlight === i) svg += `<rect x="${cx - band / 2}" y="${pad.t}" width="${band}" height="${H}" fill="var(--ink)" opacity="0.04"/>`;
    if (i % labelEvery === 0) svg += `<text x="${cx}" y="${height - 10}" text-anchor="middle">${esc(catFormat(c))}</text>`;
    svg += `<rect class="colhit" data-i="${i}" x="${cx - band / 2}" y="${pad.t}" width="${band}" height="${H}" fill="transparent"/>`;
  });
  if (ref) {
    const d = ref.values.map((v, i) => `${i ? 'L' : 'M'}${pad.l + band * i + 2},${sy(v)}H${pad.l + band * (i + 1) - 2}`).join('');
    svg += `<path d="${d}" fill="none" stroke="var(--ink-2)" stroke-width="2" stroke-linejoin="round"/>`;
  }
  svg += `<line class="axis-line" x1="${pad.l}" x2="${width - pad.r}" y1="${sy(0)}" y2="${sy(0)}"/></svg>`;
  const legend = [...stacks.map((s) => ({ name: s.name, color: s.color })), ...(ref ? [{ name: ref.name, color: 'var(--ink-2)', kind: 'line' }] : [])];
  el.innerHTML = svg + (legend.length >= 2 ? legendHtml(legend) : '');
  el.querySelectorAll('.colhit').forEach((r) => {
    r.addEventListener('pointermove', (e) => {
      const i = Number(r.dataset.i);
      const rows = stacks
        .filter((s) => s.values[i] > 0)
        .map((s) => `<div><span class="line" style="background:${s.color}"></span><span class="v">${esc(yFormat(s.values[i]))}</span> <span class="k">${esc(s.name)}</span></div>`)
        .join('');
      const refRow = ref ? `<div class="k">${esc(ref.name)}: ${esc(yFormat(ref.values[i]))}</div>` : '';
      showTip(`<div class="k">${esc(tipTitle(categories[i]))}</div>${rows || '<div class="k">No load</div>'}${stacks.length > 1 ? `<div><b>${esc(yFormat(totals[i]))}</b> total</div>` : ''}${refRow}`, e.clientX, e.clientY);
    });
    r.addEventListener('pointerleave', hideTip);
  });
}

/** Horizontal bar chart (e.g. tornado / sensitivity). rows: [{ label, value, tip }] */
export function hbarChart(el, { rows, color = 'var(--s1)', format = (v) => v, max = null, labelWidth = 240 }) {
  const width = Math.max(320, el.clientWidth || 600);
  const rowH = 26;
  const height = rows.length * rowH + 8;
  const m = max ?? Math.max(...rows.map((r) => Math.abs(r.value)), 0.0001);
  const lw = Math.min(labelWidth, width * 0.45);
  const W = width - lw - 60;
  let svg = `<svg class="chart" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img">`;
  rows.forEach((r, i) => {
    const y = i * rowH + 4;
    const w = Math.max(2, (Math.abs(r.value) / m) * W);
    const label = r.label.length > 42 ? `${r.label.slice(0, 41)}…` : r.label;
    svg += `<text x="${lw - 8}" y="${y + 15}" text-anchor="end" fill="var(--ink-2)">${esc(label)}</text>`;
    svg += `<path d="M${lw},${y + 4}H${lw + w - 4}Q${lw + w},${y + 4} ${lw + w},${y + 8}V${y + 14}Q${lw + w},${y + 18} ${lw + w - 4},${y + 18}H${lw}Z" fill="${r.color || color}"/>`;
    svg += `<text x="${lw + w + 6}" y="${y + 15}" class="label-strong">${esc(format(r.value))}</text>`;
    svg += `<rect class="hhit" data-i="${i}" x="0" y="${y}" width="${width}" height="${rowH}" fill="transparent"/>`;
  });
  svg += `<line class="axis-line" x1="${lw}" x2="${lw}" y1="0" y2="${height}"/></svg>`;
  el.innerHTML = svg;
  el.querySelectorAll('.hhit').forEach((h) => {
    h.addEventListener('pointermove', (e) => {
      const r = rows[Number(h.dataset.i)];
      showTip(`<div class="v">${esc(format(r.value))}</div><div class="k">${esc(r.tip || r.label)}</div>`, e.clientX, e.clientY);
    });
    h.addEventListener('pointerleave', hideTip);
  });
}

/** Sequential utilisation colour (one hue, light→dark), overload flagged separately. */
export function utilColor(u) {
  if (u <= 0.001) return 'var(--surface-2)';
  if (u < 0.25) return 'var(--seq-100)';
  if (u < 0.5) return 'var(--seq-200)';
  if (u < 0.75) return 'var(--seq-300)';
  if (u < 0.9) return 'var(--seq-400)';
  return 'var(--seq-500)';
}
export function utilInk(u) {
  return u >= 0.75 ? '#ffffff' : 'var(--ink)';
}
