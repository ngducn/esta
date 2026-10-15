/**
 * Every section of the signed-in app, once. The tab bar and the sidebar render the `primary`
 * sections in this order; the avatar menu renders the `account` ones. `key` is also the
 * section's message key in the `nav` namespace.
 */
export const sections = [
  { key: 'home', href: '/', placement: 'primary', icon: 'M3.5 11 12 4l8.5 7M5.5 9.5V20h13V9.5M10 20v-5.5h4V20' },
  { key: 'properties', href: '/properties', placement: 'primary', icon: 'M3 20h18M5 20V4h8v16M13 9h6v11M8.5 8h1M8.5 12h1M8.5 16h1' },
  {
    key: 'collections',
    href: '/collections',
    placement: 'primary',
    icon: 'M3 6.5h18v11H3zM12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z',
  },
  { key: 'documents', href: '/documents', placement: 'primary', icon: 'M6.5 3H14l4 4v14H6.5zM14 3v4h4M9.5 12h5M9.5 16h5' },
  { key: 'assistant', href: '/assistant', placement: 'primary', icon: 'M4.5 19.5l1-4.5L15.5 5L19 8.5l-10 10zM13.5 7L17 10.5' },
  { key: 'reports', href: '/reports', placement: 'account', icon: null },
  { key: 'settings', href: '/settings', placement: 'account', icon: null },
] as const;

export type Section = (typeof sections)[number];
export type SectionKey = Section['key'];
export type PrimarySection = Extract<Section, { placement: 'primary' }>;

export const primarySections = sections.filter((section): section is PrimarySection => section.placement === 'primary');

export const accountSections = sections.filter((section) => section.placement === 'account');

/** A section owns its own path and everything below it; `/` owns only itself. */
export function isActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));
}

/** The item the tab bar and sidebar draw: the section plus its label, translated on the server. */
export type NavItem = { key: SectionKey; href: string; icon: string; label: string };
