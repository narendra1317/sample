// Builds dist/keel-demo.html: the complete application in ONE self-contained
// file running in browser demo mode (no server, data kept in localStorage).
// Ideal for sales demos, e-mailing to prospects, or hosting on any static site.
//   npm run build:demo
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');
fs.mkdirSync(out, { recursive: true });

const result = await build({
  entryPoints: [path.join(root, 'public/app/main.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  write: false,
  target: ['es2020'],
  legalComments: 'none',
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(root, 'public/styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8')
  .replace(/<title>.*<\/title>/, '<title>Keel Project Controls</title>')
  .replace('<link rel="stylesheet" href="styles.css" />', `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="app/main.js"></script>', `<script>window.KEEL_MODE = 'demo';</script>\n<script>\n${js}\n</script>`);
const file = path.join(out, 'keel-demo.html');
fs.writeFileSync(file, html);
console.log(`Wrote ${path.relative(root, file)} (${Math.round(html.length / 1024)} KB)`);

// Embeddable variant (no document wrapper, opens signed in as the demo PM)
// for hosts that supply their own <html>/<head>/<body>, e.g. Claude artifacts.
if (process.argv.includes('--embed')) {
  const embed = html
    .replace(/<!doctype html>\s*/i, '')
    .replace(/<html[^>]*>\s*/i, '')
    .replace(/<\/html>\s*/i, '')
    .replace(/<\/?head>\s*/gi, '')
    .replace(/<\/?body>\s*/gi, '')
    .replace(/<meta charset="utf-8" \/>\s*/i, '')
    .replace(/<meta name="viewport"[^>]*>\s*/i, '')
    .replace("window.KEEL_MODE = 'demo';", "window.KEEL_MODE = 'demo'; window.KEEL_AUTOLOGIN = 'pm@demo.keel';");
  const ef = path.join(out, 'keel-embed.html');
  fs.writeFileSync(ef, embed);
  console.log(`Wrote ${path.relative(root, ef)} (${Math.round(embed.length / 1024)} KB)`);
}
