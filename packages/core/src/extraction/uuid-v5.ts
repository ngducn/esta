/** RFC 4122 URL namespace, the one seed ids use, so SQL's `extensions.uuid_generate_v5(uuid_ns_url(), name)` agrees. */
const URL_NAMESPACE = Uint8Array.from([0x6b, 0xa7, 0xb8, 0x11, 0x9d, 0xad, 0x11, 0xd1, 0x80, 0xb4, 0x00, 0xc0, 0x4f, 0xd4, 0x30, 0xc8]);

const rotl = (x: number, n: number) => ((x << n) | (x >>> (32 - n))) >>> 0;

function sha1(bytes: Uint8Array): Uint8Array {
  const total = Math.ceil((bytes.length + 9) / 64) * 64;
  const message = new Uint8Array(total);
  message.set(bytes);
  message[bytes.length] = 0x80;
  const view = new DataView(message.buffer);
  view.setUint32(total - 8, Math.floor((bytes.length * 8) / 2 ** 32));
  view.setUint32(total - 4, (bytes.length * 8) >>> 0);
  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Array<number>(80).fill(0);
  for (let offset = 0; offset < total; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 80; i += 1) w[i] = rotl((w[i - 3] ?? 0) ^ (w[i - 8] ?? 0) ^ (w[i - 14] ?? 0) ^ (w[i - 16] ?? 0), 1);
    let [a, b, c, d, e] = h as [number, number, number, number, number];
    for (let i = 0; i < 80; i += 1) {
      const [f, k] =
        i < 20 ? [(b & c) | (~b & d), 0x5a827999] : i < 40 ? [b ^ c ^ d, 0x6ed9eba1] : i < 60 ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc] : [b ^ c ^ d, 0xca62c1d6];
      const next = (rotl(a, 5) + f + e + k + (w[i] ?? 0)) >>> 0;
      [e, d, c, b, a] = [d, c, rotl(b, 30), a, next];
    }
    [a, b, c, d, e].forEach((value, index) => (h[index] = ((h[index] ?? 0) + value) >>> 0));
  }
  const out = new Uint8Array(20);
  const outView = new DataView(out.buffer);
  h.forEach((value, index) => outView.setUint32(index * 4, value));
  return out;
}

/** A name-based UUID (version 5), so the same name always names the same row and a retried write converges. */
export function uuidV5(name: string): string {
  const encoded = new TextEncoder().encode(name);
  const input = new Uint8Array(URL_NAMESPACE.length + encoded.length);
  input.set(URL_NAMESPACE);
  input.set(encoded, URL_NAMESPACE.length);
  const bytes = sha1(input).subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
