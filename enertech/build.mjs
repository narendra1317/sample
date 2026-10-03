#!/usr/bin/env node
/*
 * Static site builder for the EnerTech Synergies website.
 * No dependencies: run `node build.mjs` (Node 18+).
 *
 *  src/pages/**.html   page bodies, each starting with a <!--meta {...} --> JSON block
 *  src/partials/*.html shared head / header / footer / CTA
 *  site/               output (deployable as-is; assets live in site/assets)
 *
 * Template tokens
 *  {{root}}              relative path to the site root ("" or "../")
 *  {{title}} {{description}} {{canonical}} {{year}} etc. from page meta
 *  {{icon:name}}         inline SVG icon from ICONS below
 *  {{active:key}}        ' aria-current="page"' when meta.nav === key
 *  <!-- @include name --> include src/partials/name.html
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src');
const OUT = join(ROOT, 'site');
const SITE_URL = 'https://www.enertechsynergies.com';

const ICONS = {
  'arrow-right': '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  'arrow-up-right': '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  linkedin: '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  // sector icons
  rig: '<path d="M12 2v6"/><path d="m8 22 4-14 4 14"/><path d="M6 22h12"/><path d="M9.5 14h5"/><path d="M4 8h16"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10Z"/><path d="M2 21c0-3 1.9-5.4 5.1-6"/>',
  wind: '<path d="M12 12v10"/><path d="M12 12 4.5 7.5"/><path d="M12 12l7.5-4.5"/><path d="M12 12V3"/><circle cx="12" cy="12" r="1.5"/>',
  chip: '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/><path d="M12 7v10"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  // general
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7l10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  compass: '<circle cx="12" cy="12" r="10"/><path d="m16.2 7.8-2.1 6.3-6.3 2.1 2.1-6.3z"/>',
  award: '<circle cx="12" cy="8" r="6"/><path d="M15.5 13 17 22l-5-3-5 3 1.5-9"/>',
  heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z"/><path d="M6.5 17A2.5 2.5 0 0 0 4 19.5 2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  bike: '<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5V14l-3-3 4-3 2 3h2"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  trend: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
};

const icon = (name) => {
  const body = ICONS[name];
  if (!body) throw new Error(`Unknown icon: ${name}`);
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
};

const partial = (name) => readFileSync(join(SRC, 'partials', `${name}.html`), 'utf8');

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') ? [p] : [];
  });
}

function render(tpl, vars, depth = 0) {
  if (depth > 5) throw new Error('Include depth exceeded');
  let out = tpl.replace(/<!--\s*@include\s+([\w-]+)\s*-->/g, (_, n) => render(partial(n), vars, depth + 1));
  out = out.replace(/\{\{icon:([\w-]+)\}\}/g, (_, n) => icon(n));
  out = out.replace(/\{\{active:([\w-]+)\}\}/g, (_, k) => (vars.nav === k ? ' aria-current="page"' : ''));
  out = out.replace(/\{\{([\w]+)\}\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return out;
}

const pages = walk(join(SRC, 'pages'));
let count = 0;
for (const file of pages) {
  const raw = readFileSync(file, 'utf8');
  const m = raw.match(/^<!--meta\s*([\s\S]*?)-->\s*/);
  if (!m) throw new Error(`Missing meta block: ${file}`);
  const meta = JSON.parse(m[1]);
  const body = raw.slice(m[0].length);
  const rel = relative(join(SRC, 'pages'), file).split(sep).join('/');
  const depth = rel.split('/').length - 1;
  const root = depth ? '../'.repeat(depth) : '';
  const urlPath = rel === 'index.html' ? '/' : `/${rel}`;
  const vars = {
    root,
    year: new Date().getFullYear(),
    canonical: SITE_URL + urlPath,
    ogImage: `${SITE_URL}/assets/img/og-image.jpg`,
    bodyClass: '',
    nav: '',
    ...meta,
  };
  vars.sectorsActiveClass = vars.nav === 'sectors' ? ' is-active' : '';
  vars.aboutActiveClass = vars.nav === 'about' ? ' is-active' : '';
  vars.fullTitle = meta.title === 'Home'
    ? 'EnerTech Synergies | Multidisciplinary Engineering Consultancy, Aberdeen'
    : `${meta.title} | EnerTech Synergies`;
  vars.content = render(body, vars);
  const html = render(partial('layout'), vars);
  const out = join(OUT, rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  count++;
}

// sitemap.xml
const urls = pages
  .map((f) => relative(join(SRC, 'pages'), f).split(sep).join('/'))
  .filter((r) => r !== '404.html')
  .map((r) => `  <url><loc>${SITE_URL}${r === 'index.html' ? '/' : '/' + r}</loc></url>`)
  .join('\n');
writeFileSync(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);

console.log(`Built ${count} pages → ${relative(process.cwd(), OUT) || '.'}`);
