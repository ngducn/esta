import { openSync } from 'fontkit';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const USAGE = `usage: node coverage.mjs (--text <string> | --text-file <path>) [--require-features tnum,lnum] <font>[@axis=value,...] ...`;

function parseArgs(argv) {
  const out = { text: null, require: [], fonts: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--text') out.text = argv[++i];
    else if (a === '--text-file') out.text = readFileSync(argv[++i], 'utf8').trim();
    else if (a === '--require-features') out.require = argv[++i].split(',').filter(Boolean);
    else out.fonts.push(a);
  }
  if (out.text === null || out.fonts.length === 0) {
    console.error(USAGE);
    process.exit(2);
  }
  return out;
}

function parseSpec(spec) {
  const at = spec.lastIndexOf('@');
  if (at === -1) return { path: spec, axes: {} };
  const axes = {};
  for (const kv of spec.slice(at + 1).split(',')) {
    const [k, v] = kv.split('=');
    axes[k] = Number(v);
  }
  return { path: spec.slice(0, at), axes };
}

const DIGITS = '0123456789';

function widths(font, features) {
  const run = font.layout(DIGITS, features);
  return run.glyphs.map((g) => g.advanceWidth);
}

function lining(font) {
  const cap = font.glyphForCodePoint(0x48).bbox.maxY;
  const run = font.layout(DIGITS, ['lnum']);
  return Math.min(...run.glyphs.map((g) => g.bbox.maxY)) >= 0.85 * cap;
}

function check(spec, text, required) {
  const { path, axes } = parseSpec(spec);
  const base = openSync(path);
  const font = Object.keys(axes).length ? base.getVariation(axes) : base;
  const feats = new Set((base.availableFeatures ?? []).map(String));
  const cps = [...new Set([...text].map((c) => c.codePointAt(0)))].sort((a, b) => a - b);
  const missing = cps.filter((cp) => !base.hasGlyphForCodePoint(cp) || font.glyphForCodePoint(cp).id === 0);
  const tnumWidths = new Set(widths(font, ['tnum']));
  const defWidths = new Set(widths(font, []));
  const row = {
    font: basename(path) + (Object.keys(axes).length ? '@' + Object.entries(axes).map(([k, v]) => `${k}=${v}`).join(',') : ''),
    codePoints: cps.length,
    missing: missing.map((cp) => 'U+' + cp.toString(16).toUpperCase().padStart(4, '0') + ' ' + String.fromCodePoint(cp)),
    tnum: feats.has('tnum'),
    lnumFeature: feats.has('lnum'),
    lining: lining(font),
    tnumUniform: tnumWidths.size === 1,
    defaultDigitsProportional: defWidths.size > 1,
  };
  const missingFeatures = required.filter((f) => f !== 'lnum' && f !== 'tnum' && !feats.has(f));
  if (required.includes('tnum') && !row.tnumUniform) missingFeatures.push('tnum');
  if (required.includes('lnum') && !row.lining) missingFeatures.push('lnum');
  row.ok = missing.length === 0 && missingFeatures.length === 0;
  return row;
}

const { text, require, fonts } = parseArgs(process.argv.slice(2));
const norm = text.normalize('NFC');
if (norm !== text) console.error('note: input was not NFC; checking the NFC form');

const rows = fonts.map((f) => check(f, norm, require));
const yn = (b) => (b ? 'yes' : 'NO');
const header = ['font', 'cps', 'missing', 'tnum', 'lnum feat', 'lining digits', 'tnum digits uniform', 'default digits proportional', 'result'];
const table = rows.map((r) => [
  r.font,
  String(r.codePoints),
  r.missing.length ? r.missing.join(' ') : '0',
  yn(r.tnum),
  yn(r.lnumFeature),
  yn(r.lining),
  yn(r.tnumUniform),
  r.defaultDigitsProportional ? 'yes' : 'no',
  r.ok ? 'PASS' : 'FAIL',
]);
const w = header.map((h, i) => Math.max(h.length, ...table.map((r) => r[i].length)));
const line = (r) => '| ' + r.map((c, i) => c.padEnd(w[i])).join(' | ') + ' |';
console.log(line(header));
console.log('|' + w.map((n) => '-'.repeat(n + 2)).join('|') + '|');
table.forEach((r) => console.log(line(r)));
process.exit(rows.every((r) => r.ok) ? 0 : 1);
