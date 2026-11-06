import Link from 'next/link';
import { cn } from '@/lib/utils';

export type FilterTab = { key: string; label: string; count: number | null; href: string; current: boolean };

export function FilterTabs({ label, tabs, testId, ariaCurrent = 'true' }: { label: string; tabs: readonly FilterTab[]; testId?: string; ariaCurrent?: 'true' | 'page' }) {
  return (
    <nav aria-label={label} data-testid={testId} className="inline-flex max-w-full flex-wrap gap-0.5 rounded-md bg-segment-track p-0.5">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          replace
          scroll={false}
          aria-current={tab.current ? ariaCurrent : undefined}
          data-tab={tab.key}
          className={cn(
            'inline-flex min-h-9 items-center gap-1.5 rounded-sm max-md:min-h-touch px-3 text-label font-medium whitespace-nowrap transition-colors duration-(--duration-fast) ease-standard pointer-coarse:min-h-touch',
            tab.current ? 'bg-segment-selected text-text shadow-xs ring-1 ring-border' : 'text-text-secondary hover:text-text',
          )}
        >
          {tab.label}
          {tab.count === null ? null : <span className={cn('num', tab.current ? 'text-text-secondary' : 'text-text-muted')}> {tab.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
