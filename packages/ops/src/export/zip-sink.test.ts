import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { zipPartsSink } from './zip-sink';

const bytes = (length: number, fill: number) => new Uint8Array(length).fill(fill);

function sinkWith(partBytes: number) {
  const uploaded = new Map<string, Uint8Array>();
  const sink = zipPartsSink({
    partBytes,
    partName: (index) => (index === 1 ? 'x.zip' : `x-part-${index}.zip`),
    upload: async (name, data) => void uploaded.set(name, data),
    mtime: Date.UTC(2026, 9, 7),
  });
  return { sink, uploaded };
}

async function* chunks(...pieces: string[]) {
  for (const piece of pieces) yield new TextEncoder().encode(piece);
}

describe('zipPartsSink', () => {
  it('writes one valid ZIP with the entries and the manifest when nothing passes the part size', async () => {
    const { sink, uploaded } = sinkWith(1_000_000);
    await sink.add('tables/a.json', chunks('[1,', '2]'));
    await sink.add('files/documents/h/d/a.pdf', bytes(100, 7), 100);
    await sink.finish((parts) => new TextEncoder().encode(JSON.stringify({ parts })));
    expect([...uploaded.keys()]).toEqual(['x.zip']);
    const files = unzipSync(uploaded.get('x.zip') ?? new Uint8Array());
    expect(Object.keys(files).sort()).toEqual(['files/documents/h/d/a.pdf', 'manifest.json', 'tables/a.json']);
    expect(strFromU8(files['tables/a.json'] ?? new Uint8Array())).toBe('[1,2]');
    expect(files['files/documents/h/d/a.pdf']).toEqual(bytes(100, 7));
    expect(JSON.parse(strFromU8(files['manifest.json'] ?? new Uint8Array()))).toEqual({ parts: ['x.zip'] });
  });

  it('starts a new part before an entry that would pass the part size, and lists every part in the manifest', async () => {
    const { sink, uploaded } = sinkWith(1500);
    for (const [name, fill] of [['files/a.pdf', 1], ['files/b.pdf', 2], ['files/c.pdf', 3]] as const) await sink.add(name, bytes(1000, fill), 1000);
    await sink.finish((parts) => new TextEncoder().encode(JSON.stringify({ parts })));
    expect([...uploaded.keys()]).toEqual(['x.zip', 'x-part-2.zip', 'x-part-3.zip']);
    const last = unzipSync(uploaded.get('x-part-3.zip') ?? new Uint8Array());
    expect(Object.keys(last).sort()).toEqual(['files/c.pdf', 'manifest.json']);
    expect(JSON.parse(strFromU8(last['manifest.json'] ?? new Uint8Array()))).toEqual({ parts: ['x.zip', 'x-part-2.zip', 'x-part-3.zip'] });
    expect(Object.keys(unzipSync(uploaded.get('x.zip') ?? new Uint8Array()))).toEqual(['files/a.pdf']);
  });

  it('puts a single entry bigger than the part size in a part of its own instead of refusing it', async () => {
    const { sink, uploaded } = sinkWith(500);
    await sink.add('files/big.pdf', bytes(2000, 9), 2000);
    await sink.add('files/small.pdf', bytes(10, 1), 10);
    await sink.finish((parts) => new TextEncoder().encode(JSON.stringify({ parts })));
    expect(Object.keys(unzipSync(uploaded.get('x.zip') ?? new Uint8Array()))).toEqual(['files/big.pdf']);
    expect(Object.keys(unzipSync(uploaded.get('x-part-2.zip') ?? new Uint8Array())).sort()).toEqual(['files/small.pdf', 'manifest.json']);
  });
});
