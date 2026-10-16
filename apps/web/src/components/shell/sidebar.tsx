'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { isActive, type NavItem } from './nav';
import { activeLabel, SectionIcon } from './tab-bar';

export function Sidebar({
  items,
  label,
  header,
  footer,
}: {
  items: readonly NavItem[];
  label: string;
  header: ReactNode;
  footer: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-sidebar shrink-0 flex-col overflow-y-auto border-r border-rule lg:flex">
      <div className="px-6 pt-6 pb-5">{header}</div>
      <nav aria-label={label}>
        <ul className="flex flex-col gap-1 px-3">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                className="group flex min-h-touch items-center gap-3 rounded-sm px-3 text-body font-medium text-ink-muted transition-colors duration-(--duration-fast) ease-standard hover:bg-rule/50 hover:text-ink aria-[current=page]:text-ink"
              >
                <SectionIcon d={item.icon} />
                <span className={`min-w-0 break-words ${activeLabel}`}>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-auto border-t border-rule p-3">{footer}</div>
    </aside>
  );
}
