import { describe, expect, it } from 'vitest';
import { bindingWarning, exposedListeners, parseListeners } from './bindings.ts';
import { slotPorts } from './slot.ts';

const ports = slotPorts(13);
const LAN = '192.168.1.7';

function lsof(names: readonly string[]): string {
  return ['p100', ...names.flatMap((name, index) => [`f${index + 3}`, `n${name}`])].join('\n');
}

describe('parseListeners', () => {
  it('reads IPv4, IPv6 and wildcard listeners from lsof -Fn', () => {
    expect(parseListeners(lsof(['*:55621', '127.0.0.1:4300', '[::1]:55623', '192.168.1.7:4743']))).toEqual([
      { address: '*', port: 55621 },
      { address: '127.0.0.1', port: 4300 },
      { address: '[::1]', port: 55623 },
      { address: '192.168.1.7', port: 4743 },
    ]);
  });
});

describe('exposedListeners', () => {
  it('flags every Supabase port that listens beyond loopback', () => {
    const listeners = parseListeners(
      lsof([`*:${ports.api}`, `*:${ports.api}`, `*:${ports.db}`, `*:${ports.studio}`, `0.0.0.0:${ports.inbucket}`]),
    );
    expect(exposedListeners(listeners, ports).map((listener) => listener.service)).toEqual([
      'Supabase API',
      'database',
      'Studio',
      'Inbucket',
    ]);
  });

  it('accepts Supabase on loopback and the LAN proxy on the LAN address', () => {
    const listeners = parseListeners(
      lsof([`127.0.0.1:${ports.api}`, `[::1]:${ports.db}`, `${LAN}:${ports.webLan}`, `${LAN}:${ports.apiLan}`, `127.0.0.1:${ports.web}`]),
    );
    expect(exposedListeners(listeners, ports, LAN)).toEqual([]);
  });

  it('flags a LAN proxy port bound to every interface', () => {
    const listeners = parseListeners(lsof([`*:${ports.inbucketLan}`]));
    expect(exposedListeners(listeners, ports, LAN)).toEqual([{ address: '*', port: ports.inbucketLan, service: 'Inbucket over LAN' }]);
  });

  it('ignores ports of other slots and programs', () => {
    expect(exposedListeners(parseListeners(lsof(['*:7000', `*:${slotPorts(9).db}`])), ports)).toEqual([]);
  });
});

describe('bindingWarning', () => {
  it('stays quiet when nothing is exposed', () => {
    expect(bindingWarning([], 13)).toBeUndefined();
  });

  it('names each exposed listener and points to the fixes', () => {
    const text = bindingWarning([{ address: '*', port: ports.studio, service: 'Studio' }], 13) ?? '';
    expect(text).toContain(`*:${ports.studio} (Studio)`);
    expect(text).toContain('Waiting for Ryan');
  });
});
