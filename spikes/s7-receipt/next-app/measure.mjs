import { readFileSync, statSync, realpathSync, mkdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve('.');
const linuxResvgDir = process.argv[2];

function trace(routeDir) {
  const nft = path.join(root, '.next/server/app/api', routeDir, 'route.js.nft.json');
  const base = path.dirname(nft);
  const files = JSON.parse(readFileSync(nft, 'utf8')).files.map((f) => path.resolve(base, f));
  const real = new Set();
  for (const f of files) {
    if (!existsSync(f)) continue;
    const r = realpathSync(f);
    if (statSync(r).isFile()) real.add(r);
  }
  return [...real];
}

const group = (f) => {
  const m = f.match(/node_modules\/\.pnpm\/([^/]+)\//);
  if (m) return m[1].replace(/@[^@]*$/, '').replace(/\+/g, '/');
  if (f.includes('/fonts/')) return 'fonts';
  if (f.includes('/.next/')) return '.next (app code)';
  return 'other';
};

for (const dir of ['receipt/[id]', 'receipt-reactpdf/[id]']) {
  let files = trace(dir);
  const darwinResvg = files.filter((f) => /resvg-js-darwin/.test(f));
  files = files.filter((f) => !darwinResvg.includes(f));
  const stage = path.join(root, '.measure-stage');
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  const by = {};
  let total = 0;
  files.forEach((f, i) => {
    const sz = statSync(f).size;
    total += sz;
    const g = group(f);
    by[g] = (by[g] ?? 0) + sz;
    const dest = path.join(stage, String(i), path.basename(f));
    mkdirSync(path.dirname(dest), { recursive: true });
    copyFileSync(f, dest);
  });
  let linuxExtra = 0;
  if (linuxResvgDir) {
    for (const f of execSync(`find ${linuxResvgDir} -type f`).toString().trim().split('\n')) {
      const sz = statSync(f).size;
      linuxExtra += sz;
      mkdirSync(path.join(stage, 'linux'), { recursive: true });
      copyFileSync(f, path.join(stage, 'linux', path.basename(f)));
    }
  }
  const zipBytes = Number(execSync(`cd ${stage} && zip -qr -9 - . | wc -c`).toString().trim());
  const MB = (n) => (n / 1048576).toFixed(2) + ' MB';
  console.log(`\n== ${dir}: ${files.length} files (darwin resvg binary excluded: ${darwinResvg.length})`);
  console.log(`uncompressed, without linux binary: ${MB(total)}`);
  console.log(`uncompressed, with linux-x64-gnu resvg binary (+${MB(linuxExtra)}): ${MB(total + linuxExtra)}`);
  console.log(`zipped (deflate -9) incl. linux binary: ${MB(zipBytes)}`);
  console.log('top contributors:');
  Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([k, v]) => console.log(`  ${MB(v).padStart(9)}  ${k}`));
}
rmSync(path.join(root, '.measure-stage'), { recursive: true, force: true });
