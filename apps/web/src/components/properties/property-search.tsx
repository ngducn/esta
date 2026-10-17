'use client';

import { Search } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

const DEBOUNCE_MS = 200;

/** Without script the form still submits the query on Enter. */
export function PropertySearch({ label, placeholder }: { label: string; placeholder: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const urlQuery = params.get('q') ?? '';
  const [value, setValue] = useState(urlQuery);
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (document.activeElement !== input.current) setValue(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    // The pathname only changes when the new page commits, so unmount alone is too late: a click on any link has to cancel the replace.
    const cancelOnLinkClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('a[href]') !== null) clearTimeout(timer.current);
    };
    document.addEventListener('click', cancelOnLinkClick, true);
    return () => {
      document.removeEventListener('click', cancelOnLinkClick, true);
      clearTimeout(timer.current);
    };
  }, []);

  function update(next: string) {
    setValue(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const query = new URLSearchParams(params.toString());
      if (next.trim() === '') query.delete('q');
      else query.set('q', next);
      const search = query.toString();
      startTransition(() => router.replace(search === '' ? pathname : `${pathname}?${search}`, { scroll: false }));
    }, DEBOUNCE_MS);
  }

  return (
    <form role="search" action={pathname} className="min-w-0 basis-full lg:max-w-sm lg:flex-1 lg:basis-auto" onSubmit={(event) => event.preventDefault()}>
      {[...params.entries()]
        .filter(([key]) => key !== 'q')
        .map(([key, entry]) => (
          <input key={key} type="hidden" name={key} value={entry} />
        ))}
      <label className="flex min-h-touch items-center gap-2.5 rounded-md border border-field bg-surface px-3.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
        <Search className="size-5 shrink-0 text-ink-muted" aria-hidden="true" />
        <span className="sr-only">{label}</span>
        <input
          ref={input}
          type="search"
          name="q"
          value={value}
          onChange={(event) => update(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent py-2 text-body text-ink outline-none placeholder:text-ink-muted"
        />
      </label>
    </form>
  );
}
