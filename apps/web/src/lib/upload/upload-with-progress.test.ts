import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UploadError, uploadWithProgress } from './upload-with-progress';

type Outcome = { status: number } | 'network';

/** A stand-in XMLHttpRequest that reports progress in four steps and stores the body at its URL, as an upsert would. */
function fakeXhr(store: Map<string, Blob>, outcomes: Outcome[]) {
  return class {
    status = 0;
    upload: { onprogress: ((event: { loaded: number; total: number; lengthComputable: boolean }) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    headers = new Map<string, string>();
    private url = '';
    open(_method: string, url: string) {
      this.url = url;
    }
    setRequestHeader(name: string, value: string) {
      this.headers.set(name, value);
    }
    send(body: Blob) {
      const outcome = outcomes.shift() ?? { status: 200 };
      for (const step of [1, 2, 3, 4]) this.upload.onprogress?.({ loaded: (body.size * step) / 4, total: body.size, lengthComputable: true });
      if (outcome === 'network') {
        this.onerror?.();
        return;
      }
      this.status = outcome.status;
      if (outcome.status < 300) store.set(this.url, body);
      this.onload?.();
    }
  };
}

describe('uploadWithProgress', () => {
  const store = new Map<string, Blob>();
  const outcomes: Outcome[] = [];
  beforeEach(() => {
    store.clear();
    outcomes.length = 0;
    vi.stubGlobal('XMLHttpRequest', fakeXhr(store, outcomes));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reports monotonic progress up to the file size', async () => {
    const seen: number[] = [];
    const file = new Blob([new Uint8Array(4000)], { type: 'image/jpeg' });
    await uploadWithProgress('https://storage.test/upload/sign/a.jpg?token=t', file, ({ loaded }) => seen.push(loaded));
    expect(seen).toEqual([1000, 2000, 3000, 4000]);
    expect(seen).toEqual(seen.toSorted((a, b) => a - b));
  });

  it('rejects on a network error and leaves one object after a retry to the same URL', async () => {
    const url = 'https://storage.test/upload/sign/a.jpg?token=t';
    const file = new Blob([new Uint8Array(10)], { type: 'image/jpeg' });
    outcomes.push('network');
    await expect(uploadWithProgress(url, file)).rejects.toBeInstanceOf(UploadError);
    await uploadWithProgress(url, file);
    expect([...store.keys()]).toEqual([url]);
  });

  it('rejects on a refusal from Storage', async () => {
    outcomes.push({ status: 403 });
    await expect(uploadWithProgress('https://storage.test/x', new Blob(['x']))).rejects.toMatchObject({ status: 403 });
  });
});
