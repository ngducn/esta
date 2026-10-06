'use client';

import { useId, useRef, useState, useTransition } from 'react';
import { suggestCurrentUnit, type UnitSuggestion } from './suggest';

type Lookup = { text: string; rows: readonly UnitSuggestion[] } | { text: string; failed: string };

export function AddressLookup() {
  const inputId = useId();
  const [text, setText] = useState('');
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [pending, startTransition] = useTransition();
  const latest = useRef('');

  function search(next: string) {
    setText(next);
    latest.current = next;
    startTransition(async () => {
      let result: Lookup;
      try {
        result = { text: next, rows: await suggestCurrentUnit(next) };
      } catch (error) {
        result = { text: next, failed: error instanceof Error ? error.message : 'lookup failed' };
      }
      if (latest.current === next) setLookup(result);
    });
  }

  return (
    <section aria-labelledby={`${inputId}-heading`} className="flex flex-col gap-2" data-testid="address-lookup">
      <h2 id={`${inputId}-heading`} className="text-lg font-semibold">
        Live suggest_current_unit
      </h2>
      <label htmlFor={inputId} className="text-sm">
        Old address
      </label>
      <input
        id={inputId}
        data-testid="address-lookup-input"
        value={text}
        onChange={(event) => search(event.target.value)}
        autoComplete="off"
        className="min-h-11 max-w-xl rounded border px-3 py-2 text-base"
      />
      <div aria-live="polite" aria-busy={pending} data-testid="address-lookup-output" data-for={lookup?.text ?? ''}>
        {lookup === null || lookup.text === '' ? null : 'failed' in lookup ? (
          <p>{lookup.failed}</p>
        ) : lookup.rows.length === 0 ? (
          <p>No match</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {lookup.rows.map((row) => (
              <li
                key={row.commune_code}
                data-testid="address-suggestion"
                data-code={row.commune_code}
                data-province={row.province_code}
                data-merge-kind={row.merge_kind}
                className="border-b pb-2"
              >
                <p className="font-semibold">
                  {row.rank}. {row.commune_name} ({row.commune_code})
                </p>
                <p>
                  {row.province_name} ({row.province_code}) · {row.merge_kind}
                </p>
                <p className="text-sm">Matched {row.matched_legacy_name}</p>
                <p className="text-sm wrap-anywhere" data-testid="address-suggestion-source">
                  Source {row.source}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
