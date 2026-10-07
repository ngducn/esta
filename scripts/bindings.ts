import { spawnSync } from 'node:child_process';
import type { SlotPorts } from './slot.ts';

export type Listener = { address: string; port: number };
export type Exposed = Listener & { service: string };

const LOOPBACK = new Set(['127.0.0.1', '[::1]']);

const SUPABASE: readonly [keyof SlotPorts, string][] = [
  ['api', 'Supabase API'],
  ['db', 'database'],
  ['studio', 'Studio'],
  ['inbucket', 'Inbucket'],
];
const LAN_PROXY: readonly [keyof SlotPorts, string][] = [
  ['webLan', 'web app over LAN'],
  ['apiLan', 'Supabase API over LAN'],
  ['inbucketLan', 'Inbucket over LAN'],
];

export function parseListeners(lsofFn: string): Listener[] {
  return lsofFn.split('\n').flatMap((line) => {
    const match = /^n(.+):(\d+)$/.exec(line);
    return match?.[1] === undefined || match[2] === undefined ? [] : [{ address: match[1], port: Number(match[2]) }];
  });
}

export function listListeners(): Listener[] {
  return parseListeners(spawnSync('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fn'], { encoding: 'utf8' }).stdout);
}

export function exposedListeners(listeners: readonly Listener[], ports: SlotPorts, lan?: string): Exposed[] {
  const rules: [number, string, (address: string) => boolean][] = SUPABASE.map(([key, service]) => [
    ports[key],
    service,
    (address) => LOOPBACK.has(address),
  ]);
  if (lan !== undefined) {
    rules.push([ports.web, 'web app', (address) => LOOPBACK.has(address)]);
    for (const [key, service] of LAN_PROXY) rules.push([ports[key], service, (address) => address === lan]);
  }
  const exposed = rules.flatMap(([port, service, allowed]) =>
    listeners.filter((listener) => listener.port === port && !allowed(listener.address)).map((listener) => ({ ...listener, service })),
  );
  return [...new Map(exposed.map((listener) => [`${listener.address}:${listener.port}`, listener])).values()];
}

export function bindingWarning(exposed: readonly Exposed[], slot: number): string | undefined {
  if (exposed.length === 0) return undefined;
  const lines = [
    `Warning: ESTA_SLOT=${slot} listens beyond this Mac on ${exposed.map(({ address, port, service }) => `${address}:${port} (${service})`).join(', ')}.`,
  ];
  if (exposed.some(({ service }) => SUPABASE.some(([, name]) => name === service))) {
    lines.push(
      'Anyone on this network can open Studio, pg-meta and the database with the well-known local Supabase keys.',
      'The Supabase CLI publishes its ports on every interface and has no option to bind them to 127.0.0.1.',
      'See the security item under "Waiting for Ryan" in docs/plan/STATUS.md for the fixes.',
    );
  }
  return lines.join('\n');
}
