import { IntentLink } from '@/components/shell/intent-link';

export type SectionTab = { readonly href: string; readonly label: string; readonly current: boolean };

/** Tabs as links under a page title. The active tab reads by shape and weight as well as color: a semibold label over a solid bar. */
export function SectionTabs({ label, tabs }: { label: string; tabs: readonly SectionTab[] }) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto border-b border-rule px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-2">
        {tabs.map((tab) => (
          <li key={tab.href}>
            <IntentLink
              href={tab.href}
              aria-current={tab.current ? 'page' : undefined}
              className="group relative flex min-h-touch items-center px-3 text-body font-medium whitespace-nowrap text-ink-muted transition-colors duration-(--duration-fast) ease-standard outline-none hover:text-ink focus-visible:rounded-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent aria-[current=page]:font-semibold aria-[current=page]:text-ink"
            >
              {tab.label}
              <span aria-hidden="true" className="absolute inset-x-0 -bottom-px hidden h-0.75 rounded-full bg-accent group-aria-[current=page]:block" />
            </IntentLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
