import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import CryptoJS from 'crypto-js';

interface Bank {
  bin: string;
  code: string;
  name: string;
  shortName?: string;
  isTransfer: number;
}

const dataDir = (name: string) => fileURLToPath(new URL(`../data/${name}`, import.meta.url));
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const fetchedAt = new Date().toISOString();

async function getJson(url: string, headers: Record<string, string> = {}): Promise<{ text: string; json: any }> {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', ...headers } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const text = await res.text();
  return { text, json: JSON.parse(text) };
}

async function vietqrIo(): Promise<{ text: string; banks: Bank[] }> {
  const { text, json } = await getJson('https://api.vietqr.io/v2/banks');
  return {
    text,
    banks: json.data.map((b: any) => ({
      bin: b.bin,
      code: b.code,
      name: b.name,
      shortName: b.shortName,
      isTransfer: b.isTransfer,
    })),
  };
}

async function napasPortal(): Promise<{ text: string; banks: Bank[] }> {
  const headers = { Referer: 'https://vietqr.net/' };
  const token: string = (await getJson('https://vietqr.net/portal-service/api/data/generate', headers)).json.data;
  const { json } = await getJson('https://vietqr.net/portal-service/v1/info/banks', {
    ...headers,
    Authorization: `Bearer ${token}`,
  });
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const text = CryptoJS.AES.decrypt(json.data, ymd + token).toString(CryptoJS.enc.Utf8);
  const items = JSON.parse(text).items;
  return { text, banks: items.map((b: any) => ({ bin: b.bin, code: b.code, name: b.name, isTransfer: b.isTransfer })) };
}

const [io, napas] = await Promise.all([vietqrIo(), napasPortal()]);

const snapshots = [
  { file: 'bank-bins.vietqr-io.json', source: 'https://api.vietqr.io/v2/banks', publisher: 'VietQR.io (Casso)', ...io },
  {
    file: 'bank-bins.napas-vietqr-net.json',
    source: 'https://vietqr.net/portal-service/v1/info/banks',
    publisher: 'NAPAS (vietqr.net portal)',
    ...napas,
  },
];
const manifest = snapshots.map(({ file, source, publisher, text, banks }) => {
  const pretty = JSON.stringify(JSON.parse(text), null, 2) + '\n';
  writeFileSync(dataDir(file), pretty);
  return { file, source, publisher, fetchedAt, count: banks.length, sha256: sha256(pretty) };
});
writeFileSync(dataDir('SNAPSHOTS.json'), JSON.stringify(manifest, null, 2) + '\n');

const byBin = (banks: Bank[]) => new Map(banks.map((b) => [b.bin, b]));
const ioMap = byBin(io.banks);
const napasMap = byBin(napas.banks);
const shared = [...ioMap.keys()].filter((bin) => napasMap.has(bin));
const codeMismatches = shared
  .filter((bin) => ioMap.get(bin)!.code !== napasMap.get(bin)!.code)
  .map((bin) => ({ bin, vietqrIo: ioMap.get(bin)!.code, napas: napasMap.get(bin)!.code }));
const nameMismatches = shared
  .filter((bin) => ioMap.get(bin)!.name.normalize('NFC').trim() !== napasMap.get(bin)!.name.normalize('NFC').trim())
  .map((bin) => ({ bin, vietqrIo: ioMap.get(bin)!.name, napas: napasMap.get(bin)!.name }));
const transferFlags = (banks: Bank[]) =>
  banks.reduce<Record<string, number>>((acc, b) => ({ ...acc, [b.isTransfer]: (acc[b.isTransfer] ?? 0) + 1 }), {});
const sample = ['970436', '970415', '970418', '970405', '970422', '970407', '970416', '970423', '970432', '970403'].map(
  (bin) => ({
    bin,
    vietqrIo: ioMap.get(bin) ? `${ioMap.get(bin)!.code} | ${ioMap.get(bin)!.shortName} | ${ioMap.get(bin)!.name}` : null,
    napas: napasMap.get(bin) ? `${napasMap.get(bin)!.code} | ${napasMap.get(bin)!.name}` : null,
  }),
);

console.log(
  JSON.stringify(
    {
      fetchedAt,
      manifest,
      counts: { vietqrIo: ioMap.size, napas: napasMap.size, shared: shared.length },
      allBinsSixDigits: [...io.banks, ...napas.banks].every((b) => /^\d{6}$/.test(b.bin)),
      onlyInVietqrIo: [...ioMap.values()].filter((b) => !napasMap.has(b.bin)).map((b) => `${b.bin} ${b.code}`),
      onlyInNapas: [...napasMap.values()].filter((b) => !ioMap.has(b.bin)).map((b) => `${b.bin} ${b.code}`),
      codeMismatches,
      nameMismatches,
      isTransfer: { vietqrIo: transferFlags(io.banks), napas: transferFlags(napas.banks) },
      napasNotTransfer: napas.banks.filter((b) => b.isTransfer !== 1).map((b) => `${b.bin} ${b.code}`),
      sample,
    },
    null,
    2,
  ),
);
