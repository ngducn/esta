import Link from 'next/link';
import { cn } from '@/lib/utils';

export type FilterTab = { key: string; label: string; count: number; href: string; current: boolean };

/** One status filter with a count on each option, exactly one current. Links, so the choice lives in the URL and works before any script runs. */
export function FilterTabs({ label, tabs }: { label: string; tabs: readonly FilterTab[] }) {
  return (
    <nav aria-label={label} className="inline-flex max-w-full flex-wrap gap-0.5 rounded-md bg-segment-track p-0.5">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          replace
          scroll={false}
          aria-current={tab.current ? 'true' : undefined}
          data-tab={tab.key}
          className={cn(
            'inline-flex min-h-9 items-center gap-1.5 rounded-sm px-3 text-label font-medium whitespace-nowrap transition-colors duration-(--duration-fast) ease-standard pointer-coarse:min-h-touch',
            tab.current ? 'bg-segment-selected text-text shadow-xs ring-1 ring-border' : 'text-text-secondary hover:text-text',
          )}
        >
          {tab.label}
          <span className={cn('num', tab.current ? 'text-text-secondary' : 'text-text-muted')}>{tab.count}</span>
        </Link>
      ))}
    </nav>
  );
}
