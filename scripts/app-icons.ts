import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const web = fileURLToPath(new URL('../apps/web/', import.meta.url));
const source = readFileSync(fileURLToPath(new URL('../docs/design/redesign-2026-11/brand/esta-app-icon.svg', import.meta.url)), 'utf8');

/** sharp comes with next, so the script borrows next's copy instead of adding a dependency. */
type Sharp = (input: Buffer) => { resize: (size: number) => { png: () => { toBuffer: () => Promise<Buffer> } } };
const fromNext = createRequire(createRequire(join(web, 'package.json')).resolve('next/package.json'));
const sharp = fromNext('sharp') as Sharp;

const tile = '<rect width="64" height="64" rx="14"';
const glyphStart = '<g transform=';
if (!source.includes(tile) || !source.includes(glyphStart)) throw new Error('esta-app-icon.svg changed shape');

const rounded = source;
// iOS and masks round the corners themselves, so the tile fills the square.
const square = source.replace(tile, '<rect width="64" height="64"');
// A maskable icon keeps its content inside the central 80% circle, so the E shrinks to fit.
const maskable = square.replace(glyphStart, '<g transform="translate(32 32) scale(0.7) translate(-32 -32)"><g transform=').replace('</svg>', '</g></svg>');

async function png(svg: string, size: number, path: string): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, await sharp(Buffer.from(svg)).resize(size).png().toBuffer());
}

writeFileSync(join(web, 'src/app/icon.svg'), rounded);
await png(square, 180, join(web, 'src/app/apple-icon.png'));
await png(rounded, 192, join(web, 'public/icons/icon-192.png'));
await png(rounded, 512, join(web, 'public/icons/icon-512.png'));
await png(maskable, 512, join(web, 'public/icons/icon-maskable-512.png'));
console.log('wrote icon.svg, apple-icon.png and public/icons/*.png');
