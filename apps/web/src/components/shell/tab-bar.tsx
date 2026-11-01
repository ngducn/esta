'use client';

import { usePathname } from 'next/navigation';
import { IntentLink } from './intent-link';
import { isActive, type NavItem } from './nav';
import { sectionIcons } from './section-icons';

/** The current tab carries an accent-subtle pill behind its icon and a semibold label, so it reads without color too. Labels wrap at larger text and are never hidden. */
export function TabBar({ items, label }: { items: readonly NavItem[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="sticky bottom-0 z-10 border-t border-border bg-surface md:hidden">
      <ul className="flex min-h-[calc(var(--spacing-bottom-nav)+env(safe-area-inset-bottom))] px-1 pt-1 pb-[env(safe-area-inset-bottom)]">
        {items.map((item) => {
          const Icon = sectionIcons[item.key];
          return (
            <li key={item.key} className="min-w-0 flex-auto">
              <IntentLink
                href={item.href}
                aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                className="group flex h-full min-h-touch flex-col items-center gap-0.5 rounded-md py-1 text-center text-[0.8125rem] leading-[1.0625rem] font-medium text-text-secondary focus-visible:-outline-offset-2 aria-[current=page]:font-semibold aria-[current=page]:text-accent-text"
              >
                <span className="flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-(--duration-fast) ease-standard group-active:bg-fill-pressed group-aria-[current=page]:bg-accent-subtle">
                  <Icon className="size-icon-lg shrink-0" strokeWidth={1.8} aria-hidden="true" />
                </span>
                <span className="max-w-full text-balance">{item.label}</span>
              </IntentLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
