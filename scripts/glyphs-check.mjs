import { create } from 'fontkit';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import wawoff2 from 'wawoff2';
import { typeScale, typefaces } from '../apps/web/src/design/tokens.ts';

const repo = fileURLToPath(new URL('..', import.meta.url));
const fontDir = join(repo, 'apps/web/src/fonts');
const DIGITS = '0123456789';

const USAGE = `Usage: node scripts/glyphs-check.mjs [font.woff2 ...] [--text <string> | --text-file <path>]
With no fonts, checks every file in apps/web/src/fonts and fails when a typeface in tokens.ts has no file.`;

function parseArgs(argv) {
  const out = { text: undefined, fonts: [], checkAllShipped: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--text') out.text = argv[++i];
    else if (arg === '--text-file') out.text = readFileSync(argv[++i], 'utf8').trim();
    else if (arg.startsWith('-')) {
      console.error(`${arg === '--help' ? '' : `unknown flag ${arg}\n`}${USAGE}`);
      process.exit(arg === '--help' ? 0 : 2);
    } else out.fonts.push(arg);
  }
  out.text ??= readFileSync(join(repo, 'fixtures/glyph-test-string.txt'), 'utf8').trim();
  if (out.fonts.length === 0) {
    out.checkAllShipped = true;
    out.fonts = readdirSync(fontDir).filter((f) => f.endsWith('.woff2')).map((f) => join(fontDir, f));
  }
  return out;
}

async function load(path) {
  const bytes = readFileSync(path);
  return create(path.endsWith('.woff2') ? Buffer.from(await wawoff2.decompress(bytes)) : bytes);
}

function instancesOf(font, face) {
  const sizes = Object.values(typeScale).map((s) => s.px);
  const axis = font.variationAxes.opsz;
  const opszValues =
    face.opticalSize && axis ? [Math.min(...sizes), Math.max(...sizes)].map((s) => Math.min(axis.max, Math.max(axis.min, s))) : [undefined];
  return face.weights.flatMap((wght) => opszValues.map((opsz) => (opsz === undefined ? { wght } : { wght, opsz })));
}

const hex = (cp) => 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');

function checkInstance(base, axes, codePoints, requiredFeatures) {
  const font = base.variationAxes.wght ? base.getVariation(axes) : base;
  const missing = codePoints.filter((cp) => !base.hasGlyphForCodePoint(cp) || font.glyphForCodePoint(cp).id === 0);
  const features = new Set(base.availableFeatures.map(String));
  const failures = requiredFeatures.filter((f) => !features.has(f));
  const tnumWidths = new Set(font.layout(DIGITS, ['tnum']).glyphs.map((g) => g.advanceWidth));
  if (requiredFeatures.includes('tnum') && tnumWidths.size !== 1) failures.push('tnum widths');
  const capHeight = font.glyphForCodePoint(0x48).bbox.maxY;
  const lining = Math.min(...font.layout(DIGITS, ['lnum']).glyphs.map((g) => g.bbox.maxY)) >= 0.85 * capHeight;
  if (requiredFeatures.includes('lnum') && !lining) failures.push('lnum heights');
  return { missing, features, failures };
}

const { text, fonts, checkAllShipped } = parseArgs(process.argv.slice(2));
const shipped = new Set(fonts.map((f) => basename(f)));
const codePoints = [...new Set([...text.normalize('NFC')].map((c) => c.codePointAt(0)))].sort((a, b) => a - b);
const byFile = new Map(Object.values(typefaces).map((face) => [face.file, face]));

let failed = false;
if (checkAllShipped) {
  for (const face of Object.values(typefaces)) {
    if (shipped.has(face.file)) continue;
    console.log(`FAIL ${face.family}: ${face.file} is not in apps/web/src/fonts`);
    failed = true;
  }
}
for (const path of fonts) {
  const face = byFile.get(basename(path));
  if (!face) {
    console.log(`FAIL ${basename(path)}: not named in apps/web/src/design/tokens.ts typefaces`);
    failed = true;
    continue;
  }
  const font = await load(path);
  const required = face.requiredFeatures;
  for (const axes of instancesOf(font, face)) {
    const { missing, features, failures } = checkInstance(font, axes, codePoints, required);
    const ok = missing.length === 0 && failures.length === 0;
    failed ||= !ok;
    const instance = Object.entries(axes).map(([k, v]) => `${k}=${v}`).join(',');
    const featureNote = required.length ? ` features ${required.map((f) => `${f}=${features.has(f) ? 'yes' : 'NO'}`).join(' ')}` : '';
    const detail = [missing.length ? `missing ${missing.map(hex).join(' ')}` : '', failures.length ? `failed ${failures.join(', ')}` : '']
      .filter(Boolean)
      .join('; ');
    console.log(
      `${ok ? 'PASS' : 'FAIL'} ${face.family} ${basename(path)} @${instance} ${codePoints.length - missing.length}/${codePoints.length}${featureNote}${detail ? ` ${detail}` : ''}`,
    );
  }
}
process.exit(failed ? 1 : 0);
