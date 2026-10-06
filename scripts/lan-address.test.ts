import type { NetworkInterfaceInfo } from 'node:os';
import { describe, expect, it } from 'vitest';
import { lanAddress, type Interfaces } from './lan-address.ts';

function ipv4(address: string, internal = false): NetworkInterfaceInfo {
  return { address, family: 'IPv4', internal, netmask: '255.255.255.0', mac: '00:00:00:00:00:00', cidr: `${address}/24` };
}

function ipv6(address: string): NetworkInterfaceInfo {
  return { address, family: 'IPv6', internal: false, netmask: 'ffff:ffff:ffff:ffff::', mac: '00:00:00:00:00:00', cidr: `${address}/64`, scopeid: 0 };
}

describe('lanAddress', () => {
  it.each(['10.0.0.5', '10.255.255.254', '172.16.0.1', '172.31.255.254', '192.168.1.7'])('returns the private address %s', (address) => {
    expect(lanAddress({ en0: [ipv4(address)] })).toBe(address);
  });

  it('skips loopback and IPv6 for the first private IPv4', () => {
    const interfaces: Interfaces = {
      lo0: [ipv4('127.0.0.1', true), ipv6('::1')],
      en0: [ipv6('2402:800:62b9::1'), ipv4('192.168.1.7')],
      en1: [ipv4('10.0.0.9')],
    };
    expect(lanAddress(interfaces)).toBe('192.168.1.7');
  });

  it.each(['8.8.8.8', '172.15.0.1', '172.32.0.1', '192.169.0.1', '11.0.0.1', '100.64.0.1', '169.254.1.1'])(
    'refuses the non-private address %s',
    (address) => {
      expect(() => lanAddress({ en0: [ipv4(address)] })).toThrow(/No private IPv4 address/);
    },
  );

  it('prefers a private address listed after a public one', () => {
    expect(lanAddress({ en0: [ipv4('203.0.113.4')], en1: [ipv4('172.20.1.2')] })).toBe('172.20.1.2');
  });

  it('refuses loopback alone', () => {
    expect(() => lanAddress({ lo0: [ipv4('127.0.0.1', true)] })).toThrow(/No private IPv4 address/);
  });

  it('errors when there is no address at all', () => {
    expect(() => lanAddress({})).toThrow(/No private IPv4 address/);
    expect(() => lanAddress({ en0: undefined })).toThrow(/No private IPv4 address/);
  });
});
