'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { IntentLink } from './intent-link';
import { isActive, type NavItem } from './nav';
import { sectionIcons } from './section-icons';

const linkClass =
  'group relative flex min-h-touch items-center gap-3 rounded-md px-3 py-2 text-label text-text-secondary transition-colors duration-(--duration-fast) ease-standard hover:bg-fill-hover hover:text-text active:bg-fill-pressed focus-visible:-outline-offset-2 aria-[current=page]:bg-accent-subtle aria-[current=page]:font-semibold aria-[current=page]:text-accent-text aria-[current=page]:hover:bg-accent-subtle-hover max-lg:size-touch max-lg:justify-center max-lg:p-0';

const tooltipClass =
  'after:pointer-events-none after:absolute after:top-1/2 after:left-full after:z-20 after:ml-2 after:hidden after:-translate-y-1/2 after:rounded-md after:bg-surface-inverse after:px-2 after:py-1 after:text-body-sm after:whitespace-nowrap after:text-text-inverse after:shadow-md after:content-[attr(data-label)] max-lg:hover:after:block max-lg:focus-visible:after:block';

/** From 840 px the sidebar is an icon rail: the label stays as the accessible name and shows in a tooltip. From 1080 px it is the full 256 px sidebar. */
function NavList({ items, pathname }: { items: readonly NavItem[]; pathname: string }) {
  return (
    <ul className="flex flex-col gap-0.5 max-lg:items-center">
      {items.map((item) => {
        const Icon = sectionIcons[item.key];
        return (
          <li key={item.key} className="max-lg:flex max-lg:justify-center">
            <IntentLink href={item.href} aria-current={isActive(pathname, item.href) ? 'page' : undefined}
              data-label={item.label}
              className={`${linkClass} ${tooltipClass}`}>
              <Icon className="size-icon-md shrink-0" strokeWidth={1.8} aria-hidden="true" />
              <span className="min-w-0 text-balance max-lg:sr-only">{item.label}</span>
            </IntentLink>
          </li>
        );
      })}
    </ul>
  );
}

export function Sidebar({
  items,
  more,
  label,
  moreLabel,
  header,
  footer,
}: {
  items: readonly NavItem[];
  more: readonly NavItem[];
  label: string;
  moreLabel: string;
  header: ReactNode;
  footer: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 z-10 hidden h-dvh w-rail shrink-0 flex-col items-stretch gap-5 border-r border-border bg-surface px-3 py-5 md:flex lg:w-sidebar lg:overflow-y-auto">
      {header}
      <nav aria-label={label}>
        <NavList items={items} pathname={pathname} />
      </nav>
      <nav aria-labelledby="sidebar-more" className="flex flex-col gap-0.5">
        <p id="sidebar-more" className="px-3 pt-3 pb-1 text-body-sm font-medium text-text-muted max-lg:sr-only">
          {moreLabel}
        </p>
        <hr aria-hidden="true" className="my-2 border-t border-border lg:hidden" />
        <NavList items={more} pathname={pathname} />
      </nav>
      <div className="mt-auto">{footer}</div>
    </aside>
  );
}
