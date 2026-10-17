'use client';

import { shortProvinceName } from '@esta/core/properties';
import { Check, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { suggestAddress } from '@/app/(app)/properties/actions';
import { cn } from '@/lib/utils';
import type { CurrentUnitSuggestion } from '@/server/address/suggest';

const DEBOUNCE_MS = 300;

/**
 * The certificate address stays exactly as typed (PRP-4, DOMAIN-VN §4); this only offers the current ward it now
 * belongs to, and a tap fills the picker above.
 */
export function LegacyAddressSuggest({
  value,
  onChange,
  pickedCommune,
  onPick,
}: {
  value: string;
  onChange: (text: string) => void;
  pickedCommune: string | null;
  onPick: (suggestion: CurrentUnitSuggestion) => void;
}) {
  const t = useTranslations('propertyForm');
  const id = useId();
  const [typed, setTyped] = useState(false);
  const [suggestions, setSuggestions] = useState<readonly CurrentUnitSuggestion[]>([]);
  const latest = useRef(0);

  useEffect(() => {
    if (!typed) return;
    const request = ++latest.current;
    const timer = setTimeout(() => {
      suggestAddress(value)
        .then((found) => {
          if (request === latest.current) setSuggestions(found);
        })
        .catch(() => {
          if (request === latest.current) setSuggestions([]);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [typed, value]);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-body font-semibold text-ink">
        {t('certificateAddress')}
      </label>
      <p id={`${id}-hint`} className="text-small text-ink-muted">
        {t('certificateHint')}
      </p>
      <textarea
        id={id}
        data-testid="certificate-address"
        value={value}
        rows={3}
        maxLength={500}
        aria-describedby={`${id}-hint`}
        onChange={(event) => {
          setTyped(true);
          onChange(event.target.value);
        }}
        className="mt-1 min-h-touch w-full rounded-md border border-field bg-surface px-3.5 py-2.5 text-body text-ink hover:border-ink-muted"
      />
      {typed && suggestions.length > 0 ? (
        <section aria-labelledby={`${id}-suggest`} className="mt-2 flex flex-col gap-2">
          <div className="flex flex-col">
            <h3 id={`${id}-suggest`} className="text-body font-semibold text-ink">
              {t('suggestTitle')}
            </h3>
            <p className="text-small text-ink-muted">{t('suggestHelp')}</p>
          </div>
          <ul data-testid="legacy-suggestions" className="flex flex-col gap-2">
            {suggestions.map((suggestion) => {
              const picked = suggestion.communeCode === pickedCommune;
              return (
                <li key={suggestion.communeCode}>
                  <button
                    type="button"
                    aria-pressed={picked}
                    onClick={() => onPick(suggestion)}
                    className={cn(
                      'flex min-h-touch w-full items-start gap-3 rounded-md border px-3.5 py-2.5 text-left transition-colors duration-(--duration-fast) ease-standard',
                      picked ? 'border-accent bg-surface' : 'border-rule-strong bg-surface hover:border-field hover:bg-surface-2',
                    )}
                  >
                    <MapPin className="mt-0.5 size-5 shrink-0 text-ink-muted" aria-hidden="true" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-body font-semibold text-ink wrap-anywhere">{suggestion.communeName}</span>
                      <span className="text-small text-ink-muted wrap-anywhere">{shortProvinceName(suggestion.provinceName)}</span>
                    </span>
                    {suggestion.partial ? (
                      <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-small font-semibold text-ink-2">{t('partial')}</span>
                    ) : null}
                    {picked ? <Check className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
