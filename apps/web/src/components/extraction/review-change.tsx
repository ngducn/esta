'use client';

import type { FieldDecision } from '@esta/core/extraction/acceptance';
import { replacedAddress } from '@esta/core/extraction/review-changes';
import { Replace } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { FieldView } from '@/server/extraction/field-views';

function savedValue(field: FieldView, decision: FieldDecision | undefined): string | null {
  if (decision === undefined) return null;
  const value = decision.kind === 'edited' ? decision.value.trim() : field.editValue;
  return value === '' ? null : value;
}

/** #356: the certificate address Lưu writes over, shown before Mẹ saves; nothing when the property has none or the same one. */
export function ReviewChange({ fields, decisions, before }: { fields: readonly FieldView[]; decisions: Readonly<Record<string, FieldDecision>>; before: string | null }) {
  const t = useTranslations('extraction');
  const saved = Object.fromEntries(
    fields.flatMap((field) => {
      const value = savedValue(field, decisions[field.path]);
      return value === null ? [] : [[field.path, { value }] as const];
    }),
  );
  const replaced = replacedAddress(saved, before);
  if (replaced === null) return null;
  return (
    <div data-testid="review-change" role="note" className="flex items-start gap-3 rounded-md bg-bg-subtle px-4 py-3">
      <Replace className="mt-0.5 size-5 shrink-0 text-text-secondary" strokeWidth={1.8} aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-body font-medium text-text">{t('changeTitle')}</p>
        <dl className="flex flex-col gap-2">
          <div>
            <dt className="text-body-sm text-text-muted">{t('changeBefore')}</dt>
            <dd data-testid="change-before" className="text-body break-words text-text-secondary">
              {replaced.before}
            </dd>
          </div>
          <div>
            <dt className="text-body-sm text-text-muted">{t('changeAfter')}</dt>
            <dd data-testid="change-after" className="text-body break-words text-text">
              {replaced.after}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
