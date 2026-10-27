/** `key` is also the section's message key in the `nav` namespace and its icon in `section-icons.ts`. */
export const sections = [
  { key: 'home', href: '/', placement: 'primary' },
  { key: 'properties', href: '/properties', placement: 'primary' },
  { key: 'collections', href: '/collections', placement: 'primary' },
  { key: 'documents', href: '/documents', placement: 'primary' },
  { key: 'assistant', href: '/assistant', placement: 'primary' },
  { key: 'reports', href: '/reports', placement: 'account' },
  { key: 'settings', href: '/settings', placement: 'account' },
  { key: 'diagnostics', href: '/assistant/diagnostics', placement: 'operator' },
] as const;

export type Section = (typeof sections)[number];
export type SectionKey = Section['key'];

export const primarySections = sections.filter((section) => section.placement === 'primary');

export const accountSections = sections.filter((section) => section.placement === 'account');

export const operatorSections = sections.filter((section) => section.placement === 'operator');

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));
}

export type NavItem = { key: SectionKey; href: string; label: string };
