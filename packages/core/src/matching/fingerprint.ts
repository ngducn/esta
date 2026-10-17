import type { StatementRow } from './decode';
import { normalizeDescription } from './memo';

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be,
  0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa,
  0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85,
  0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
  0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const INITIAL = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);

const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

function padded(bytes: Uint8Array): Uint8Array {
  const length = Math.ceil((bytes.length + 9) / 64) * 64;
  const out = new Uint8Array(length);
  out.set(bytes);
  out[bytes.length] = 0x80;
  const bits = BigInt(bytes.length) * 8n;
  new DataView(out.buffer).setBigUint64(length - 8, bits);
  return out;
}

/** SHA-256 of the UTF-8 bytes of `text`, as lowercase hex (FIPS 180-4). Pure, so it runs wherever core runs. */
export function sha256Hex(text: string): string {
  const message = padded(new TextEncoder().encode(text));
  const view = new DataView(message.buffer);
  const hash = new Uint32Array(INITIAL);
  const w = new Uint32Array(64);
  for (let offset = 0; offset < message.length; offset += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(offset + t * 4);
    for (let t = 16; t < 64; t++) {
      const w15 = w[t - 15] as number;
      const w2 = w[t - 2] as number;
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
      w[t] = ((w[t - 16] as number) + s0 + (w[t - 7] as number) + s1) >>> 0;
    }
    let a = hash[0] as number;
    let b = hash[1] as number;
    let c = hash[2] as number;
    let d = hash[3] as number;
    let e = hash[4] as number;
    let f = hash[5] as number;
    let g = hash[6] as number;
    let h = hash[7] as number;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + (K[t] as number) + (w[t] as number)) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    const round = [a, b, c, d, e, f, g, h];
    for (let i = 0; i < 8; i++) hash[i] = ((hash[i] as number) + (round[i] as number)) >>> 0;
  }
  return Array.from(hash, (word) => word.toString(16).padStart(8, '0')).join('');
}

type FingerprintFields = Pick<StatementRow, 'date' | 'amount' | 'bankRef' | 'description'>;

/**
 * A row's fingerprint and whether an earlier row of the same file (`of`, its position) is the
 * same transfer. A bank reference names one transfer, so a later row with the same reference,
 * date and amount is that transfer printed again. A row without one can only be told apart by
 * position, so a later identical copy may be a second transfer.
 */
export type RowIdentity =
  | { fingerprint: string; copy: 'first' }
  | { fingerprint: string; copy: 'same_reference' | 'identical'; of: number };

function identityText(row: FingerprintFields): string {
  return row.bankRef === ''
    ? ['row', row.date, String(row.amount), normalizeDescription(row.description)].join('\n')
    : ['ref', row.date, String(row.amount), row.bankRef].join('\n');
}

/**
 * The fingerprint is the contract P3-15 stores (LSE-8): the SHA-256, as lowercase hex, of
 * `ref`, date, amount and bank reference joined by newlines for a row with a reference, and of
 * `row`, date, amount, normalized description and occurrence for a row without one, where the
 * nth identical row of the file is occurrence n. A re-export of the same rows hashes the same.
 */
export function identifyRows(rows: readonly FingerprintFields[]): RowIdentity[] {
  const seen = new Map<string, { first: number; count: number }>();
  return rows.map((row, position) => {
    const text = identityText(row);
    const earlier = seen.get(text);
    const count = (earlier?.count ?? 0) + 1;
    seen.set(text, { first: earlier?.first ?? position, count });
    const referenced = row.bankRef !== '';
    const fingerprint = sha256Hex(referenced ? text : `${text}\n${count}`);
    if (earlier === undefined) return { fingerprint, copy: 'first' };
    return { fingerprint, copy: referenced ? 'same_reference' : 'identical', of: earlier.first };
  });
}
