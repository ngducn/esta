import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import type { EntryData, ExportSink } from './sink';

export type ZipSinkOptions = {
  /** A part is closed before an entry that would take it past this many bytes; one entry always fits in a part. */
  readonly partBytes: number;
  readonly partName: (index: number) => string;
  readonly upload: (name: string, bytes: Uint8Array) => Promise<void>;
  /** Stamped on every entry, so the ZIP carries the Clock's date and not the machine's. */
  readonly mtime: number;
};

type Part = {
  readonly name: string;
  readonly zip: Zip;
  readonly done: Promise<Uint8Array>;
  size: () => number;
  entries: number;
};

const COMPRESSED = /\.(pdf|jpe?g|png|webp|avif|zip)$/i;

function openPart(name: string): Part {
  const chunks: Uint8Array[] = [];
  let size = 0;
  const handle: { zip?: Zip } = {};
  const done = new Promise<Uint8Array>((resolve, reject) => {
    handle.zip = new Zip((error, chunk, final) => {
      if (error) return reject(error);
      chunks.push(chunk);
      size += chunk.length;
      if (final) {
        const bytes = new Uint8Array(size);
        let at = 0;
        for (const piece of chunks) {
          bytes.set(piece, at);
          at += piece.length;
        }
        chunks.length = 0;
        resolve(bytes);
      }
    });
  });
  if (handle.zip === undefined) throw new Error('fflate did not create the ZIP');
  return { name, zip: handle.zip, done, size: () => size, entries: 0 };
}

async function* chunksOf(data: EntryData): AsyncGenerator<Uint8Array> {
  if (data instanceof Uint8Array) yield data;
  else yield* data;
}

/** A ZIP writer that holds one part in memory at a time: a closed part is uploaded and dropped before the next opens. */
export function zipPartsSink(options: ZipSinkOptions): ExportSink {
  const closed: string[] = [];
  let current: Part | undefined;

  const close = async (part: Part) => {
    part.zip.end();
    await options.upload(part.name, await part.done);
    closed.push(part.name);
  };

  const write = async (part: Part, path: string, data: EntryData) => {
    const entry = COMPRESSED.test(path) ? new ZipPassThrough(path) : new ZipDeflate(path, { level: 6 });
    entry.mtime = options.mtime;
    part.zip.add(entry);
    part.entries += 1;
    for await (const chunk of chunksOf(data)) entry.push(chunk, false);
    entry.push(new Uint8Array(0), true);
  };

  return {
    async add(path, data, size = 0) {
      if (current !== undefined && current.entries > 0 && current.size() + size > options.partBytes) {
        await close(current);
        current = undefined;
      }
      current ??= openPart(options.partName(closed.length + 1));
      await write(current, path, data);
    },
    async finish(manifest) {
      current ??= openPart(options.partName(closed.length + 1));
      await write(current, 'manifest.json', manifest([...closed, current.name]));
      await close(current);
      current = undefined;
    },
  };
}
