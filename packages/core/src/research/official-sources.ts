export type OfficialSource = { readonly label: string; readonly hosts: readonly string[] };

/** The sources a research scan and a legal answer trust, in the order the scan prompt names them; a host matches itself and its subdomains. */
export const OFFICIAL_SOURCES: readonly OfficialSource[] = [
  { label: '*.gov.vn', hosts: ['gov.vn'] },
  { label: 'chinhphu.vn', hosts: ['chinhphu.vn'] },
  { label: 'baochinhphu.vn', hosts: ['baochinhphu.vn'] },
  { label: 'provincial portals', hosts: ['gov.vn'] },
  { label: 'thuvienphapluat.vn', hosts: ['thuvienphapluat.vn'] },
  { label: 'luatvietnam.vn', hosts: ['luatvietnam.vn'] },
];

export const officialSourcesText = (): string => OFFICIAL_SOURCES.map(({ label }) => label).join(', ');

export function isOfficialHost(host: string): boolean {
  const name = host.toLowerCase();
  return OFFICIAL_SOURCES.some(({ hosts }) => hosts.some((official) => name === official || name.endsWith(`.${official}`)));
}
