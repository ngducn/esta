'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isActive, type NavItem } from './nav';
import { sectionIcons } from './section-icons';

/** The current tab carries a tinted pill behind its icon and a bold label, so it reads without color too. */
export function TabBar({ items, label }: { items: readonly NavItem[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="sticky bottom-0 z-10 border-t border-rule bg-surface lg:hidden">
      <ul className="grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
        {items.map((item) => {
          const Icon = sectionIcons[item.key];
          return (
            <li key={item.key} className="min-w-0">
              <Link
                href={item.href}
                aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                className="group flex min-h-touch flex-col items-center gap-1 pt-2 pb-2.5 text-center text-small leading-tight font-medium text-ink-muted aria-[current=page]:font-bold aria-[current=page]:text-accent"
              >
                <span className="flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-(--duration-fast) ease-standard group-aria-[current=page]:bg-accent-tint group-aria-[current=page]:text-accent">
                  <Icon className="size-5.5 shrink-0" strokeWidth={1.9} aria-hidden="true" />
                </span>
                <span className="max-w-full break-words hyphens-auto">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
