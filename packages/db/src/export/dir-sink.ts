import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ExportSink } from './sink';

/** One folder instead of ZIP parts, for the nightly backup: `name` is the only part the manifest lists. */
export function dirSink(root: string, name: string): ExportSink {
  const base = resolve(root);
  const add: ExportSink['add'] = async (path, data) => {
    const full = resolve(base, path);
    if (!full.startsWith(base + sep)) throw new Error(`Refusing to write ${path}: it is outside the backup folder`);
    await mkdir(dirname(full), { recursive: true, mode: 0o700 });
    if (data instanceof Uint8Array) await writeFile(full, data, { mode: 0o600 });
    else await pipeline(Readable.from(data), createWriteStream(full, { mode: 0o600 }));
  };
  return { add, finish: (manifest) => add('manifest.json', manifest([name])) };
}
