import type { NetworkInterfaceInfo } from 'node:os';

export type Interfaces = NodeJS.Dict<NetworkInterfaceInfo[]>;

export function isPrivateIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  const [a, b] = octets as [number, number, number, number];
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function lanAddress(interfaces: Interfaces): string {
  for (const infos of Object.values(interfaces)) {
    for (const info of infos ?? []) {
      if (info.family === 'IPv4' && !info.internal && isPrivateIpv4(info.address)) return info.address;
    }
  }
  throw new Error('No private IPv4 address in 10.0.0.0/8, 172.16.0.0/12 or 192.168.0.0/16. Join a local network first.');
}
