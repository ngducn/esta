'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { IntentLink } from './intent-link';
import { isActive, type NavItem } from './nav';
import { sectionIcons } from './section-icons';

const linkClass =
  'flex min-h-touch items-center gap-3 rounded-sm px-3 text-body font-medium text-ink-2 transition-colors duration-(--duration-fast) ease-standard hover:bg-surface-2 hover:text-ink aria-[current=page]:bg-accent-tint aria-[current=page]:font-medium aria-[current=page]:text-accent';

function NavList({ items, pathname }: { items: readonly NavItem[]; pathname: string }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = sectionIcons[item.key];
        return (
          <li key={item.key}>
            <IntentLink href={item.href} aria-current={isActive(pathname, item.href) ? 'page' : undefined} className={linkClass}>
              <Icon className="size-5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
              <span className="min-w-0 break-words">{item.label}</span>
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
    <aside className="sticky top-0 hidden h-dvh w-sidebar shrink-0 flex-col gap-5 overflow-y-auto border-r border-rule bg-surface px-4 py-5 lg:flex">
      {header}
      <nav aria-label={label}>
        <NavList items={items} pathname={pathname} />
      </nav>
      <nav aria-labelledby="sidebar-more" className="flex flex-col gap-1">
        <p id="sidebar-more" className="px-3 pb-1 text-small font-medium text-ink-muted">
          {moreLabel}
        </p>
        <NavList items={more} pathname={pathname} />
      </nav>
      <div className="mt-auto border-t border-rule pt-3">{footer}</div>
    </aside>
  );
}
