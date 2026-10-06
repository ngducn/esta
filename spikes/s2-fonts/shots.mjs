import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const GLYPHS = readFileSync(resolve(here, 'glyph-test-string.txt'), 'utf8').trim();

const SANS = {
  bvp: { name: 'Be Vietnam Pro', faces: [400, 500, 600, 700].map((w, i) => ({ w, file: `BeVietnamPro-${['Regular', 'Medium', 'SemiBold', 'Bold'][i]}.ttf` })) },
  ss3: { name: 'Source Sans 3', variable: 'SourceSans3%5Bwght%5D.ttf', range: '200 900' },
  pub: { name: 'Public Sans', variable: 'PublicSans%5Bwght%5D.ttf', range: '100 900' },
};
const SERIF = {
  ss4: { name: 'Source Serif 4', variable: 'SourceSerif4%5Bopsz,wght%5D.ttf', range: '200 900' },
  nr: { name: 'Newsreader', variable: 'Newsreader%5Bopsz,wght%5D.ttf', range: '200 800' },
};
const PAIRS = [
  ['bvp', 'ss4'],
  ['ss3', 'ss4'],
  ['bvp', 'nr'],
  ['pub', 'ss4'],
];

function faceCss(key, def) {
  if (def.faces) {
    return def.faces.map((f) => `@font-face{font-family:"${def.name}";font-weight:${f.w};src:url("../fonts/${f.file}") format("truetype");}`).join('\n');
  }
  return `@font-face{font-family:"${def.name}";font-weight:${def.range};src:url("../fonts/${def.variable}") format("truetype");}`;
}

const ROWS = [
  ['Phòng 1', 'Đặng Thị Hường', '05/10/2026', '3.500.000 ₫'],
  ['Phòng 2', 'Nguyễn Văn Ước', '05/11/2026', '12.750.000 ₫'],
  ['Phòng 3', 'Lê Thị Ngọc Ánh', '11/11/2026', '1.111.000 ₫'],
  ['Phòng 4', 'Trần Quốc Việt', '01/01/2027', '45.000.000 ₫'],
  ['Tổng', '', '', '62.361.000 ₫'],
];

function page(sansKey, serifKey) {
  const sans = SANS[sansKey];
  const serif = SERIF[serifKey];
  const rows = ROWS.map(
    (r, i) =>
      `<tr${i === ROWS.length - 1 ? ' class="total"' : ''}><td>${r[0]}</td><td>${r[1]}</td><td class="date">${r[2]}</td><td class="amt">${r[3]}</td></tr>`,
  ).join('');
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${sans.name} + ${serif.name}</title>
<style>
${faceCss(sansKey, sans)}
${faceCss(serifKey, serif)}
:root{--paper:oklch(98.5% .006 85);--surface:oklch(99.6% .003 85);--ink:oklch(24% .02 60);--muted:oklch(48% .015 60);--rule:oklch(90% .01 80);--lacquer:oklch(42% .11 35);
--sans:"${sans.name}",sans-serif;--serif:"${serif.name}",serif;}
:root[data-theme=dark]{--paper:oklch(19% .01 60);--surface:oklch(23% .012 60);--ink:oklch(93% .01 85);--muted:oklch(72% .012 80);--rule:oklch(33% .01 60);--lacquer:oklch(72% .1 40);}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:400 16px/1.5 var(--sans);padding:24px 16px 48px;}
main{max-width:1200px;margin:0 auto;display:grid;gap:28px}
@media(min-width:900px){main{grid-template-columns:1fr 1fr;gap:32px 56px}.wide{grid-column:1/-1}}
h1{font:600 14px/1.3 var(--sans);letter-spacing:.04em;text-transform:uppercase;color:var(--lacquer);margin:0}
h2{font:500 13px/1.3 var(--sans);color:var(--muted);margin:0 0 8px}
section{border-top:1px solid var(--rule);padding-top:12px;min-width:0}
.serif{font-family:var(--serif);font-variant-numeric:lining-nums tabular-nums}
.g16{font-size:16px}.g32{font-size:32px;line-height:1.35}
.fig44{font:500 44px/1.2 var(--serif);font-variant-numeric:lining-nums tabular-nums}
.fig28{font:400 28px/1.3 var(--serif);font-variant-numeric:lining-nums tabular-nums}
.n32{font:500 32px/1.35 var(--serif);font-variant-numeric:lining-nums tabular-nums}
.n44{font:600 44px/1.3 var(--serif);font-variant-numeric:lining-nums tabular-nums}
.w p{margin:2px 0}
table{border-collapse:collapse;width:100%}
td{padding:10px 8px;border-bottom:1px solid var(--rule)}
td.date{font-variant-numeric:tabular-nums;color:var(--muted);white-space:nowrap}
td.amt{text-align:right;font:500 18px/1.4 var(--serif);font-variant-numeric:lining-nums tabular-nums;white-space:nowrap}
tr.total td{border-bottom:0;font-weight:600}
tr.total td.amt{font-weight:600;font-size:22px}
.stack{display:grid;gap:4px}
.sans-nums{font-variant-numeric:tabular-nums;font-size:18px}
</style></head><body><main>
<section class="wide"><h1>${sans.name} + ${serif.name}</h1></section>
<section><h2>Glyph test string, sans 16 px</h2><p class="g16" style="margin:0">${GLYPHS}</p></section>
<section><h2>Glyph test string, sans 32 px</h2><p class="g32" style="margin:0">${GLYPHS}</p></section>
<section><h2>Glyph test string, serif 32 px (tabular, lining)</h2><p class="serif g32" style="margin:0;font-weight:400">${GLYPHS}</p></section>
<section><h2>Figures</h2><div class="stack"><div class="fig44">3.500.000 ₫</div><div class="fig28">42,5 tr / 51 tr</div><div class="fig28">12.345.678 ₫ · 11.111.111 ₫ · 90.909.090 ₫</div></div></section>
<section><h2>Names, serif 32 and 44 px</h2><div class="stack"><div class="n32">Đặng Thị Hường</div><div class="n44">Đặng Thị Hường</div><div class="n32" style="font-weight:400">Nguyễn Văn Ước · Phường Dĩ An</div></div></section>
<section class="w"><h2>Weights, sans 400 / 500 / 600 / 700</h2>
<p style="font-weight:400">400 Thửa đất số 1234, tờ bản đồ số 56 ẫ ặ ữ ỡ ự ể ộ</p><p style="font-weight:500">500 Thửa đất số 1234, tờ bản đồ số 56 ẫ ặ ữ ỡ ự ể ộ</p><p style="font-weight:600">600 Thửa đất số 1234, tờ bản đồ số 56 ẫ ặ ữ ỡ ự ể ộ</p><p style="font-weight:700">700 Thửa đất số 1234, tờ bản đồ số 56 ẫ ặ ữ ỡ ự ể ộ</p>
<h2 style="margin-top:12px">Weights, serif 400 / 500 / 600</h2>
<p class="serif" style="font-size:24px;font-weight:400">400 Đặng Thị Hường 3.500.000 ₫</p><p class="serif" style="font-size:24px;font-weight:500">500 Đặng Thị Hường 3.500.000 ₫</p><p class="serif" style="font-size:24px;font-weight:600">600 Đặng Thị Hường 3.500.000 ₫</p></section>
<section><h2>Sans digits in a column (tabular-nums requested)</h2><div class="stack sans-nums"><div>11.111.111</div><div>88.888.888</div><div>10.101.010</div><div>01/01/2027</div><div>11/11/2111</div></div></section>
<section class="wide"><h2>Amount table, amounts right-aligned in serif</h2><table><tbody>${rows}</tbody></table></section>
</main></body></html>`;
}

const outPages = resolve(here, 'pages');
const outShots = resolve(here, 'shots');
mkdirSync(outPages, { recursive: true });
mkdirSync(outShots, { recursive: true });

const files = PAIRS.map(([s, f]) => {
  const id = `${s}-${f}`;
  writeFileSync(resolve(outPages, `${id}.html`), page(s, f));
  return id;
});

const shell = (() => {
  const base = process.env.HOME + '/Library/Caches/ms-playwright';
  const dir = readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort().pop();
  const exe = `${base}/${dir}/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
  return existsSync(exe) ? exe : undefined;
})();

const browser = await chromium.launch({ executablePath: shell });
const sizes = [
  ['390x844', { width: 390, height: 844 }, 3],
  ['1440x900', { width: 1440, height: 900 }, 1],
];
for (const id of files) {
  for (const theme of ['light', 'dark']) {
    for (const [label, viewport, dsf] of sizes) {
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf === 3 ? 2 : 1 });
      const p = await ctx.newPage();
      await p.goto('file://' + resolve(outPages, `${id}.html`));
      await p.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await p.evaluate(() => document.fonts.ready);
      const loaded = await p.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight}`));
      if (loaded.length === 0) throw new Error(`no webfont loaded for ${id}`);
      await p.screenshot({ path: resolve(outShots, `${id}-${theme}-${label}.png`), fullPage: true });
      await ctx.close();
    }
  }
  console.log('shot', id);
}
await browser.close();
