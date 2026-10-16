'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isActive, type NavItem } from './nav';

export function SectionIcon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-6 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

export const activeLabel =
  'decoration-accent decoration-2 underline-offset-4 group-aria-[current=page]:text-ink group-aria-[current=page]:underline';

export function TabBar({ items, label }: { items: readonly NavItem[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="sticky bottom-0 z-10 border-t border-rule bg-ground lg:hidden">
      <ul className="grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
        {items.map((item) => (
          <li key={item.key} className="min-w-0">
            <Link
              href={item.href}
              aria-current={isActive(pathname, item.href) ? 'page' : undefined}
              className="group flex min-h-touch flex-col items-center gap-1 px-0.5 pt-2 pb-2.5 text-center text-small leading-tight font-medium text-ink-muted aria-[current=page]:text-ink"
            >
              <SectionIcon d={item.icon} />
              <span className={`max-w-full break-words hyphens-auto ${activeLabel}`}>{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
