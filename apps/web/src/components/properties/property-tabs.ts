/**
 * The detail page's tabs. Each later slice adds its tab here with its first content, so no tab is a placeholder.
 * `segment` is the route segment under `/properties/<id>`, `null` for the overview at the root.
 */
export const PROPERTY_TABS = [
  { id: 'overview', labelKey: 'overview', segment: null },
  { id: 'activity', labelKey: 'activity', segment: 'activity' },
] as const satisfies readonly { id: string; labelKey: string; segment: string | null }[];

export type PropertyTab = (typeof PROPERTY_TABS)[number];
export type PropertyTabId = PropertyTab['id'];

export function propertyTabHref(propertyId: string, tab: PropertyTab): string {
  return tab.segment === null ? `/properties/${propertyId}` : `/properties/${propertyId}/${tab.segment}`;
}
