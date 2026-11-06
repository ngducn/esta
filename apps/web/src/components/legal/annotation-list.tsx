'use client';

import { ANNOTATION_KINDS, type Annotation } from '@esta/core/schemas/legal';
import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DateInput } from '@/components/date-input';
import { dateInputProps, dateReading, type DateReading } from '@/components/use-date-field';
import { TextField } from '@/components/form-parts';
import { FormSelect } from '@/components/properties/address-picker';
import { Button } from '@/components/ui/button';

export type AnnotationDraft = { readonly key: number; readonly date: DateReading; readonly text: string; readonly kind: string };

export function annotationDraft(key: number, annotation?: Annotation): AnnotationDraft {
  return { key, date: dateReading(annotation?.date ?? null), text: annotation?.text ?? '', kind: annotation?.kind ?? '' };
}

/** Blank lines are dropped, so an added row left empty saves nothing. */
export function readAnnotations(drafts: readonly AnnotationDraft[]): Annotation[] {
  return drafts.flatMap((draft) => {
    if (draft.text.trim() === '') return [];
    const kind = ANNOTATION_KINDS.find((option) => option === draft.kind);
    return [{ text: draft.text, ...(draft.date.value === null ? {} : { date: draft.date.value }), ...(kind === undefined ? {} : { kind }) }];
  });
}

export function AnnotationList({ drafts, onChange, onAdd }: { drafts: readonly AnnotationDraft[]; onChange: (drafts: readonly AnnotationDraft[]) => void; onAdd: () => void }) {
  const t = useTranslations('propertyLegal');
  const update = (key: number, patch: Partial<AnnotationDraft>) => onChange(drafts.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3">
        {drafts.map((draft, index) => (
          <li key={draft.key} aria-label={t('annotationRow', { index: index + 1 })} className="flex flex-col gap-3 rounded-md border border-border p-3 sm:p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <DateInput label={t('annotationDate')} {...dateInputProps(draft.date, (date) => update(draft.key, { date }))} />
              <FormSelect
                label={t('annotationKind')}
                value={draft.kind}
                options={[{ value: '', label: t('annotationKindNone') }, ...ANNOTATION_KINDS.map((kind) => ({ value: kind, label: t('annotationKindOption', { kind }) }))]}
                onChange={(kind) => update(draft.key, { kind })}
              />
            </div>
            <TextField label={t('annotationText')} value={draft.text} maxLength={2000} error={null} onChange={(text) => update(draft.key, { text })} />
            <Button type="button" variant="ghost" className="self-start" onClick={() => onChange(drafts.filter((other) => other.key !== draft.key))}>
              <X aria-hidden="true" />
              {t('removeAnnotation', { index: index + 1 })}
            </Button>
          </li>
        ))}
      </ol>
      <Button type="button" variant="secondary" className="self-start" onClick={onAdd}>
        <Plus aria-hidden="true" />
        {t('addAnnotation')}
      </Button>
    </div>
  );
}
