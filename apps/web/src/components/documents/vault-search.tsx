'use client';

import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { searchDocuments, type VaultSearch } from '@/server/documents/search';
import type { SearchState } from '@/server/documents/vault';

const DEBOUNCE_MS = 250;

/** Keeps `?q=` in the address bar without a navigation, so a reload or a shared link opens the same results. */
function writeQuery(query: string) {
  const url = new URL(window.location.href);
  if (query === '') url.searchParams.delete('q');
  else url.searchParams.set('q', query);
  window.history.replaceState(window.history.state, '', url);
}

/**
 * DOC-3: the vault's first control. Each pause of 250 ms asks `searchDocuments` on the member's session; an answer to
 * an older query is dropped. A failed request, offline included, says so in words and keeps the vault below usable.
 */
export function VaultSearch({
  initial,
  propertyId,
  children,
}: {
  initial: SearchState;
  propertyId: string | null;
  children: (state: SearchState) => ReactNode;
}) {
  const t = useTranslations('documents');
  const [value, setValue] = useState('query' in initial ? initial.query : '');
  const [state, setState] = useState<SearchState>(initial);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  function run(query: string) {
    const ticket = ++latest.current;
    if (query === '') {
      setState({ step: 'idle' });
      return;
    }
    setState({ step: 'searching', query });
    void searchDocuments(query, propertyId)
      .catch((): VaultSearch => ({ ok: false }))
      .then((result) => {
        if (ticket !== latest.current) return;
        setState(result.ok ? { step: 'done', query, tiles: result.tiles, capped: result.capped } : { step: 'failed', query });
      });
  }

  function update(next: string) {
    setValue(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const query = next.trim();
      writeQuery(query);
      run(query);
    }, DEBOUNCE_MS);
  }

  return (
    <>
      <form role="search" className="min-w-0" onSubmit={(event) => {
        event.preventDefault();
        clearTimeout(timer.current);
        writeQuery(value.trim());
        run(value.trim());
      }}>
        <label className="flex min-h-touch items-center gap-2.5 rounded-md border border-field bg-surface px-3.5 shadow-card focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
          <Search className="size-5 shrink-0 text-ink-muted" aria-hidden="true" />
          <span className="sr-only">{t('searchLabel')}</span>
          <input
            type="search"
            name="q"
            data-testid="vault-search"
            value={value}
            onChange={(event) => update(event.target.value)}
            placeholder={t('searchPlaceholder')}
            autoComplete="off"
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent py-2.5 text-body text-ink outline-none placeholder:text-ink-muted"
          />
        </label>
      </form>
      {children(state)}
    </>
  );
}
