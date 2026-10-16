import ipaddr from 'ipaddr.js';

export type AddressVerdict = 'public' | 'refused';

/** ipaddr.js names every special-purpose range, so only `unicast` is public; `process` judges `::ffff:a.b.c.d` as `a.b.c.d`. */
export function vetAddress(ip: string): AddressVerdict {
  if (!ipaddr.isValid(ip)) return 'refused';
  return ipaddr.process(ip).range() === 'unicast' ? 'public' : 'refused';
}
