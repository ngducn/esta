import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { oklchHex } from '../apps/web/src/design/contrast.ts';
import { brandHousePath } from '../apps/web/src/design/brand.ts';
import { colors, radius } from '../apps/web/src/design/tokens.ts';

const web = fileURLToPath(new URL('../apps/web/', import.meta.url));

/** sharp comes with next, so the script borrows next's copy instead of adding a dependency. */
type Sharp = (input: Buffer) => { resize: (size: number) => { png: () => { toBuffer: () => Promise<Buffer> } } };
const fromNext = createRequire(createRequire(join(web, 'package.json')).resolve('next/package.json'));
const sharp = fromNext('sharp') as Sharp;

const accent = oklchHex(colors.accent.light);
const glyph = oklchHex(colors['on-accent'].light);

/** The mock's 36 px mark: a 10 px radius and a 20 px house. `bleed` fills the square for masks and iOS. */
function markSvg({ bleed, houseShare }: { bleed: boolean; houseShare: number }): string {
  const size = 512;
  const corner = bleed ? 0 : (size * radius.sm) / 36;
  const house = size * houseShare;
  const offset = (size - house) / 2;
  const scale = house / 24;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">`,
    `<rect width="${size}" height="${size}" rx="${corner}" fill="${accent}"/>`,
    `<path transform="translate(${offset} ${offset}) scale(${scale})" d="${brandHousePath}" fill="none" stroke="${glyph}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    '</svg>',
    '',
  ].join('\n');
}

const rounded = markSvg({ bleed: false, houseShare: 20 / 36 });
const square = markSvg({ bleed: true, houseShare: 20 / 36 });
// A maskable icon keeps its content inside the central 80% circle, so the house shrinks to fit.
const maskable = markSvg({ bleed: true, houseShare: 0.42 });

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
