// Small UI toolkit: escaping, formatting, modals, drawers, toasts, tooltips.

import { fmtDate } from '../core/dates.js';

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let currency = 'GBP';
export const setCurrency = (c) => (currency = c || 'GBP');

export function money(v, { compact = false, cur } = {}) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const c = cur || currency;
  if (compact && Math.abs(v) >= 1000) {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: c, notation: 'compact', maximumFractionDigits: 1 }).format(v);
  }
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(v);
}
export const num = (v, d = 0) => (v === null || v === undefined || Number.isNaN(v) ? '—' : new Intl.NumberFormat('en-GB', { maximumFractionDigits: d, minimumFractionDigits: d }).format(v));
export const pct = (v, d = 0) => (v === null || v === undefined || Number.isNaN(v) ? '—' : `${num(v, d)}%`);
export const ratio = (v) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(2));
export const date = (iso) => (iso ? fmtDate(iso) : '—');
export const signed = (v, unit = 'd') => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${v}${unit}`);

export function rag(r, label) {
  const text = label ?? { green: 'On track', amber: 'At risk', red: 'Critical' }[r] ?? r;
  return `<span class="pill rag-${esc(r)}"><span class="dot"></span>${esc(text)}</span>`;
}

export const icons = {
  portfolio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
  projects: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h7M3 12h11M3 18h6"/><path d="M14 6h7M18 12h3M13 18h8"/></svg>',
  resources: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14.5c2.4.2 4 1.8 4.5 4.5"/></svg>',
  timesheet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  approve: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12l5 5L20 6"/></svg>',
  report: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>',
  import: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>',
  theme: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>',
  logo: '<svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#2a78d6"/><path d="M6 10h20M6 16h14M6 22h8" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M22 20l3 3 5-7" stroke="#8fe3c1" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

// ---- toasts --------------------------------------------------------------
export function toast(message, kind = 'info') {
  let host = $('.toasts');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toasts';
    host.setAttribute('role', 'status');
    document.body.append(host);
  }
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  host.append(el);
  setTimeout(() => el.remove(), kind === 'error' ? 6000 : 3200);
}

// ---- modal ---------------------------------------------------------------
/**
 * Open a modal. `body` is HTML. Returns a promise resolving to the value
 * passed to close(), or null on cancel.
 */
export function modal({ title, body, actions = [{ label: 'Close', value: null }], wide = false, onMount }) {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header><h2>${esc(title)}</h2><button class="btn ghost sm" data-x aria-label="Close">✕</button></header>
      <div class="body">${body}</div>
      <footer>${actions.map((a, i) => `<button class="btn ${a.primary ? 'primary' : ''} ${a.danger ? 'danger' : ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}</footer>
    </div>`;
    const prevFocus = document.activeElement;
    const close = (v) => {
      ov.remove();
      document.removeEventListener('keydown', onKey);
      prevFocus?.focus?.();
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(null);
    };
    document.addEventListener('keydown', onKey);
    ov.addEventListener('mousedown', (e) => {
      if (e.target === ov) close(null);
    });
    ov.querySelector('[data-x]').onclick = () => close(null);
    const root = ov.querySelector('.modal');
    ov.querySelectorAll('footer [data-i]').forEach((b) => {
      b.onclick = async () => {
        const a = actions[Number(b.dataset.i)];
        if (a.handler) {
          try {
            b.disabled = true;
            const r = await a.handler(root);
            if (r === false) {
              b.disabled = false;
              return;
            }
            close(r === undefined ? a.value ?? true : r);
          } catch (e) {
            b.disabled = false;
            toast(e.message, 'error');
          }
        } else close(a.value === undefined ? true : a.value);
      };
    });
    document.body.append(ov);
    onMount?.(root, close);
    (root.querySelector('input, select, textarea') || root.querySelector('footer .primary'))?.focus();
  });
}

export async function confirmDialog(title, message, { danger = false, ok = 'Confirm' } = {}) {
  const r = await modal({ title, body: `<p>${esc(message)}</p>`, actions: [{ label: 'Cancel', value: null }, { label: ok, value: true, primary: !danger, danger }] });
  return r === true;
}

// ---- declarative forms -------------------------------------------------------
/**
 * fields: [{ name, label, type: text|number|date|select|textarea|checkbox, options: [[v,l]], hint, full, required, step, min, max }]
 */
export function formHtml(fields, values = {}) {
  return `<div class="form-grid">${fields
    .map((f) => {
      const v = values[f.name] ?? f.default ?? '';
      const id = `f_${f.name}`;
      const req = f.required ? 'required' : '';
      let input;
      if (f.type === 'select') {
        input = `<select id="${id}" name="${esc(f.name)}" ${req}>${f.options.map(([ov, ol]) => `<option value="${esc(ov)}" ${String(ov) === String(v ?? '') ? 'selected' : ''}>${esc(ol)}</option>`).join('')}</select>`;
      } else if (f.type === 'textarea') {
        input = `<textarea id="${id}" name="${esc(f.name)}" rows="${f.rows || 3}">${esc(v)}</textarea>`;
      } else if (f.type === 'checkbox') {
        input = `<input id="${id}" type="checkbox" name="${esc(f.name)}" ${v ? 'checked' : ''}>`;
      } else {
        input = `<input id="${id}" type="${f.type || 'text'}" name="${esc(f.name)}" value="${esc(v)}" ${req} ${f.step ? `step="${f.step}"` : ''} ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.max !== undefined ? `max="${f.max}"` : ''} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''}>`;
      }
      return `<label class="field ${f.full ? 'full' : ''}" for="${id}">${esc(f.label)}${f.hint ? ` <span class="hint">${esc(f.hint)}</span>` : ''}${input}</label>`;
    })
    .join('')}</div>`;
}

export function readForm(root, fields) {
  const out = {};
  for (const f of fields) {
    const el = root.querySelector(`[name="${f.name}"]`);
    if (!el) continue;
    if (f.type === 'checkbox') out[f.name] = el.checked;
    else if (f.type === 'number') out[f.name] = el.value === '' ? null : Number(el.value);
    else if (f.type === 'date') out[f.name] = el.value || null;
    else out[f.name] = el.value;
    if (f.required && (out[f.name] === '' || out[f.name] === null)) throw new Error(`${f.label} is required`);
  }
  return out;
}

export async function formDialog({ title, fields, values, submitLabel = 'Save', wide, extraHtml = '', onSubmit, onMount }) {
  return modal({
    title,
    wide,
    onMount,
    body: formHtml(fields, values) + extraHtml,
    actions: [
      { label: 'Cancel', value: null },
      {
        label: submitLabel,
        primary: true,
        handler: async (root) => {
          const data = readForm(root, fields);
          return onSubmit ? await onSubmit(data, root) : data;
        },
      },
    ],
  });
}

// ---- drawer --------------------------------------------------------------
export function drawer({ title, subtitle = '', body, footer = '', onMount, onClose }) {
  closeDrawer();
  const ov = document.createElement('div');
  ov.className = 'drawer-overlay';
  const d = document.createElement('aside');
  d.className = 'drawer';
  d.setAttribute('role', 'dialog');
  d.innerHTML = `<header><div class="h"><h2>${esc(title)}</h2>${subtitle ? `<div class="muted small">${subtitle}</div>` : ''}</div><button class="btn ghost sm" data-x aria-label="Close">✕</button></header><div class="body">${body}</div>${footer ? `<footer>${footer}</footer>` : ''}`;
  const close = () => {
    ov.remove();
    d.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && !document.querySelector('.overlay')) close();
  };
  document.addEventListener('keydown', onKey);
  ov.onclick = close;
  d.querySelector('[data-x]').onclick = close;
  d._close = close;
  document.body.append(ov, d);
  onMount?.(d, close);
  return { el: d, close };
}
export function closeDrawer() {
  const d = $('.drawer');
  if (d?._close) d._close();
}

// ---- tooltip ---------------------------------------------------------------
let tipEl = null;
export function showTip(html, x, y) {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'tooltip';
    tipEl.setAttribute('role', 'tooltip');
    document.body.append(tipEl);
  }
  tipEl.innerHTML = html;
  tipEl.style.display = 'block';
  const r = tipEl.getBoundingClientRect();
  let left = x + 14;
  let top = y + 14;
  if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
  if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
  tipEl.style.left = `${Math.max(8, left)}px`;
  tipEl.style.top = `${Math.max(8, top)}px`;
}
export function hideTip() {
  if (tipEl) tipEl.style.display = 'none';
}
/** Bind hover tooltips to every element with data-tip (HTML already escaped by the caller). */
export function bindTips(root) {
  root.querySelectorAll('[data-tip]').forEach((el) => {
    el.addEventListener('pointermove', (e) => showTip(el.dataset.tip, e.clientX, e.clientY));
    el.addEventListener('pointerleave', hideTip);
    el.addEventListener('focus', () => {
      const r = el.getBoundingClientRect();
      showTip(el.dataset.tip, r.right, r.top);
    });
    el.addEventListener('blur', hideTip);
  });
}

// ---- files -----------------------------------------------------------------
export function download(filename, text, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const f = input.files[0];
      if (!f) return resolve(null);
      const r = new FileReader();
      r.onload = () => resolve({ name: f.name, text: String(r.result) });
      r.readAsText(f);
    };
    input.click();
  });
}

/** Sortable table: columns [{key, label, num, render(row), sort(row)}]. */
export function tableHtml(rows, columns, { rowAttrs = () => '', empty = 'Nothing here yet', id = '' } = {}) {
  if (!rows.length) return `<div class="empty">${esc(empty)}</div>`;
  return `<div class="table-wrap"><table class="data" ${id ? `id="${id}"` : ''}><thead><tr>${columns
    .map((c, i) => `<th class="${c.num ? 'num' : ''} sortable" data-col="${i}">${esc(c.label)}</th>`)
    .join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr ${rowAttrs(r)}>${columns.map((c) => `<td class="${c.num ? 'num' : ''} ${c.cls || ''}">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div>`;
}

export function makeSortable(root) {
  root.querySelectorAll('table.data').forEach((t) => {
    t.querySelectorAll('th.sortable').forEach((th) => {
      th.addEventListener('click', () => {
        const idx = [...th.parentNode.children].indexOf(th);
        const body = t.tBodies[0];
        const rows = [...body.rows];
        const dir = th.dataset.dir === 'asc' ? -1 : 1;
        t.querySelectorAll('th').forEach((x) => delete x.dataset.dir);
        th.dataset.dir = dir === 1 ? 'asc' : 'desc';
        const val = (r) => {
          const txt = r.cells[idx]?.innerText.trim() ?? '';
          const n = Number(txt.replace(/[£$€,%+d\s]/g, ''));
          return txt !== '' && !Number.isNaN(n) && /\d/.test(txt) && !/[a-z]{3}-/i.test(txt) ? n : txt.toLowerCase();
        };
        rows.sort((a, b) => {
          const x = val(a);
          const y = val(b);
          return (x > y ? 1 : x < y ? -1 : 0) * dir;
        });
        body.append(...rows);
      });
    });
  });
}
