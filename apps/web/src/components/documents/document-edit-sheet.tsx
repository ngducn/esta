'use client';

import { acceptsMime, DOCUMENT_CATEGORY_IDS, isDocumentCategory, type DocumentCategory } from '@esta/core/documents';
import type { IsoDate } from '@esta/core/date';
import { useTranslations } from 'next-intl';
import { useId, useState, useTransition, type FormEvent } from 'react';
import { DateInput } from '@/components/date-input';
import { TextField } from '@/components/form-parts';
import { FormSelect } from '@/components/properties/address-picker';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { updateDocument, type DocumentEdit } from '@/server/documents/actions';
import type { DocumentDetail } from '@/server/documents/detail';

const NO_PROPERTY = 'none';

const splitTags = (text: string) => text.split(',').map((tag) => tag.trim()).filter((tag) => tag !== '');

/** `Sửa thông tin`: the row's own facts only. The file never changes, so neither does the checksum (DOC-4). */
export default function DocumentEditSheet({
  document,
  properties,
  onClose,
  onSaved,
}: {
  document: DocumentDetail;
  properties: readonly { readonly id: string; readonly nickname: string }[];
  onClose: () => void;
  onSaved: (title: string, previous: DocumentEdit) => void;
}) {
  const t = useTranslations('documents');
  const fieldId = useId();
  const [title, setTitle] = useState(document.title);
  const [category, setCategory] = useState<DocumentCategory>(document.category);
  const [propertyId, setPropertyId] = useState(document.propertyId ?? NO_PROPERTY);
  const [expiresOn, setExpiresOn] = useState<IsoDate | null>(document.expiresOn);
  const [tags, setTags] = useState(document.tags.join(', '));
  const [sensitive, setSensitive] = useState(document.sensitive);
  const [failed, setFailed] = useState(false);
  const [pending, startSave] = useTransition();
  const titleMissing = title.trim() === '';
  const wrongCategory = !acceptsMime(category, document.mime);

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (titleMissing || wrongCategory) return;
    startSave(async () => {
      const result = await updateDocument({
        documentId: document.id,
        title: title.trim(),
        category,
        propertyId: propertyId === NO_PROPERTY ? null : propertyId,
        expiresOn,
        tags: splitTags(tags),
        sensitive,
      }).catch(() => ({ ok: false }) as const);
      setFailed(!result.ok);
      if (result.ok) onSaved(title.trim(), result.previous);
    });
  };

  return (
    <Sheet open onOpenChange={(open) => (open || pending ? undefined : onClose())}>
      <SheetContent data-testid="edit-sheet">
        <div className="flex flex-col gap-1">
          <SheetTitle>{t('editTitle')}</SheetTitle>
          <SheetDescription>{t('editBody')}</SheetDescription>
        </div>
        <form noValidate onSubmit={save} className="flex flex-col gap-5">
          <TextField
            label={t('titleField')}
            inputId={`${fieldId}-title`}
            testId="edit-title"
            value={title}
            maxLength={200}
            error={titleMissing ? t('titleRequired') : null}
            onChange={setTitle}
          />
          <div className="flex flex-col gap-1">
            <FormSelect
              label={t('categoryField')}
              testId="edit-category"
              value={category}
              options={DOCUMENT_CATEGORY_IDS.map((id) => ({ value: id, label: t('category', { category: id }) }))}
              onChange={(next) => (isDocumentCategory(next) ? setCategory(next) : undefined)}
            />
            {wrongCategory ? (
              <p role="alert" className="text-small text-overdue">
                {t('categoryMismatch')}
              </p>
            ) : null}
          </div>
          <FormSelect
            label={t('propertyField')}
            testId="edit-property"
            value={propertyId}
            options={[...properties.map((property) => ({ value: property.id, label: property.nickname })), { value: NO_PROPERTY, label: t('noProperty') }]}
            onChange={setPropertyId}
          />
          <DateInput label={t('expiresField')} {...(document.expiresOn === null ? {} : { defaultValue: document.expiresOn })} onValueChange={setExpiresOn} />
          <TextField label={t('tagsField')} hint={t('tagsHint')} inputId={`${fieldId}-tags`} testId="edit-tags" value={tags} maxLength={400} error={null} onChange={setTags} />
          <div className="flex items-start gap-1">
            <Checkbox
              id={`${fieldId}-sensitive`}
              data-testid="edit-sensitive"
              checked={sensitive}
              onCheckedChange={setSensitive}
              aria-describedby={`${fieldId}-sensitive-hint`}
              className="-ml-2.5"
            />
            <div className="flex flex-col gap-0.5 pt-2.5">
              <label htmlFor={`${fieldId}-sensitive`} className="text-body font-semibold text-ink">
                {t('sensitiveField')}
              </label>
              <p id={`${fieldId}-sensitive-hint`} className="text-small text-ink-muted">
                {t('sensitiveHint')}
              </p>
            </div>
          </div>
          {failed ? (
            <p role="alert" data-testid="edit-error" className="text-body font-semibold text-overdue">
              {t('updateFailed')}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <SheetClose render={<Button type="button" variant="outline" disabled={pending} />}>{t('cancel')}</SheetClose>
            <Button type="submit" data-testid="save-edit" disabled={pending}>
              {t('save')}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
