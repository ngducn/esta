'use client';

import { ChevronDown } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/** The native select is transparent and covers the whole pill, so a tap anywhere on it opens the picker. */
export function SortSelect({ label, value, options }: { label: string; value: string; options: readonly { value: string; label: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = options.find((option) => option.value === value) ?? options[0];

  function choose(next: string) {
    const query = new URLSearchParams(params.toString());
    if (next === options[0]?.value) query.delete('sort');
    else query.set('sort', next);
    const search = query.toString();
    router.replace(search === '' ? pathname : `${pathname}?${search}`, { scroll: false });
  }

  return (
    <label className="relative flex min-h-touch items-center gap-2 rounded-sm lg:ml-auto border border-rule-strong bg-surface pr-9 pl-3.5 text-small font-semibold text-ink focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
      <span className="text-ink-muted">{label}</span>
      <span aria-hidden="true">{current?.label}</span>
      <select
        value={value}
        onChange={(event) => choose(event.target.value)}
        className="absolute -inset-px cursor-pointer appearance-none rounded-sm opacity-0"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 size-4 text-ink-muted" aria-hidden="true" />
    </label>
  );
}
