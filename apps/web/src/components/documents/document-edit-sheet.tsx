'use client';

import { acceptsMime, DOCUMENT_CATEGORY_IDS, isDocumentCategory, type DocumentCategory } from '@esta/core/documents';
import { formatDate } from '@esta/core/format';
import { parseOptionalDateInput } from '@esta/core/parse/date-input';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { DateInput } from '@/components/date-input';
import { TextField } from '@/components/form-parts';
import { FormSelect } from '@/components/properties/address-picker';
import { FormAlert } from '@/components/form-alert';
import { FormSheet } from '@/components/form-sheet';
import { useAction } from '@/components/use-action';
import type { PopupProps } from '@/components/use-deferred-dialog';
import { updateDocument, type DocumentEdit } from '@/server/documents/actions';
import type { DocumentDetail } from '@/server/documents/detail';

const NO_PROPERTY = 'none';

const splitTags = (text: string) => text.split(',').map((tag) => tag.trim()).filter((tag) => tag !== '');

type Refusal = 'failed' | 'invalid' | null;

/** `Sửa thông tin`: the row's own facts only. The file never changes, so neither does the checksum (DOC-4). */
export default function DocumentEditSheet({
  document,
  properties,
  open,
  onOpenChange,
  finalFocus,
  onSaved,
}: PopupProps & {
  document: DocumentDetail;
  properties: readonly { readonly id: string; readonly nickname: string }[];
  onSaved: (title: string, previous: DocumentEdit) => void;
}) {
  const t = useTranslations('documents');
  const locale = useLocale();
  const fieldId = useId();
  const [title, setTitle] = useState(document.title);
  const [category, setCategory] = useState<DocumentCategory>(document.category);
  const [propertyId, setPropertyId] = useState(document.propertyId ?? NO_PROPERTY);
  const [expiresText, setExpiresText] = useState(document.expiresOn === null ? '' : formatDate(document.expiresOn, locale));
  const [tags, setTags] = useState(document.tags.join(', '));
  const [refusal, setRefusal] = useState<Refusal>(null);
  const { pending, run } = useAction();
  const titleMissing = title.trim() === '';
  const wrongCategory = !acceptsMime(category, document.mime);

  const save = () => {
    if (titleMissing || wrongCategory) return;
    // An emptied field clears the date on purpose; one that does not read as a date must not clear it.
    const expiresOn = parseOptionalDateInput(expiresText);
    if (!expiresOn.ok) {
      setRefusal('invalid');
      return;
    }
    run(
      () =>
        updateDocument({
          documentId: document.id,
          title: title.trim(),
          category,
          propertyId: propertyId === NO_PROPERTY ? null : propertyId,
          expiresOn: expiresOn.value,
          tags: splitTags(tags),
        }),
      (result) => {
        setRefusal(result.ok ? null : 'failed');
        if (result.ok) onSaved(title.trim(), result.previous);
      },
    );
  };

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      finalFocus={finalFocus}
      testId="edit-sheet"
      title={t('editTitle')}
      description={t('editBody')}
      labels={{ cancel: t('cancel'), submit: t('save'), pending: t('save') }}
      submitTestId="save-edit"
      pending={pending}
      onSubmit={save}
      error={
        refusal === null ? null : refusal === 'failed' ? (
          <FormAlert message={t('updateFailed')} data-testid="edit-error" />
        ) : (
          <FormAlert message={t('editInvalid')} data-testid="edit-invalid" />
        )
      }
    >
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
      <DateInput label={t('expiresField')} {...(document.expiresOn === null ? {} : { defaultValue: document.expiresOn })} onTextChange={setExpiresText} />
      <TextField
        label={t('tagsField')}
        hint={t('tagsHint')}
        inputId={`${fieldId}-tags`}
        testId="edit-tags"
        value={tags}
        maxLength={400}
        error={null}
        onChange={setTags}
      />
    </FormSheet>
  );
}
