import ipaddr from 'ipaddr.js';

export type AddressVerdict = 'public' | 'refused';

/**
 * Only the `unicast` range is public. ipaddr.js names every other range (loopback, private, linkLocal,
 * uniqueLocal, carrierGradeNat, multicast, unspecified, reserved and more), and `process` unwraps
 * IPv4-mapped IPv6 so `::ffff:127.0.0.1` is judged as `127.0.0.1`.
 */
export function vetAddress(ip: string): AddressVerdict {
  if (!ipaddr.isValid(ip)) return 'refused';
  return ipaddr.process(ip).range() === 'unicast' ? 'public' : 'refused';
}
