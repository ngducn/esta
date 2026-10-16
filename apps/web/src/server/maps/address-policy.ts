import 'server-only';
import ipaddr from 'ipaddr.js';

export type AddressVerdict = 'public' | 'refused';

function isIpv4Compatible(address: ipaddr.IPv4 | ipaddr.IPv6): boolean {
  return address instanceof ipaddr.IPv6 && address.parts.slice(0, 6).every((part) => part === 0);
}

/**
 * ipaddr.js names every special-purpose range, so only `unicast` is public; `process` judges `::ffff:a.b.c.d` as
 * `a.b.c.d`. It still rates the deprecated IPv4-compatible form (`::7f00:1`, top 96 bits zero) as unicast.
 */
export function vetAddress(ip: string): AddressVerdict {
  if (!ipaddr.isValid(ip)) return 'refused';
  const address = ipaddr.process(ip);
  return address.range() === 'unicast' && !isIpv4Compatible(address) ? 'public' : 'refused';
}
