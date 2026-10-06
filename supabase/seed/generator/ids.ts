import { createHash } from 'node:crypto';

export type SeedId = string & { readonly __brand: 'SeedId' };

// RFC 4122 URL namespace, the same one `extensions.uuid_ns_url()` returns, so SQL can derive any seed id too.
const URL_NAMESPACE = Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex');

export function seedId(key: string): SeedId {
  const bytes = createHash('sha1').update(URL_NAMESPACE).update(key, 'utf8').digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as SeedId;
}

if (import.meta.main) {
  const keys = process.argv.slice(2);
  if (keys.length === 0) {
    console.error('Usage: tsx supabase/seed/generator/ids.ts <seed key>...');
    process.exit(2);
  }
  for (const key of keys) console.log(seedId(key));
}
