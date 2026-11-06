import type { EntryData, ExportSink } from './sink';

const decoder = new TextDecoder('utf-8', { ignoreBOM: true });

export function fakeStorage(files: Record<string, string>) {
  return {
    from: (bucket: string) => ({
      list: (prefix: string) => {
        const names = Object.keys(files).filter((path) => path.startsWith(`${bucket}/${prefix}/`)).map((path) => path.slice(`${bucket}/${prefix}/`.length));
        const entries = [...new Set(names.map((name) => name.split('/')[0] ?? ''))].map((name) => ({ name, id: names.includes(name) ? `obj-${name}` : null }));
        return Promise.resolve({ data: entries, error: null });
      },
      download: (path: string) => Promise.resolve({ data: new Blob([files[`${bucket}/${path}`] ?? '']), error: null }),
    }),
  };
}

async function collect(data: EntryData): Promise<string> {
  if (data instanceof Uint8Array) return decoder.decode(data);
  let text = '';
  for await (const chunk of data) text += decoder.decode(chunk);
  return text;
}

export function recordingSink() {
  const entries = new Map<string, string>();
  let manifestParts: readonly string[] = [];
  const sink: ExportSink = {
    async add(path, data) {
      entries.set(path, await collect(data));
    },
    async finish(manifest) {
      entries.set('manifest.json', await collect(manifest(['x.zip'])));
      manifestParts = ['x.zip'];
    },
  };
  return { sink, entries, parts: () => manifestParts };
}
