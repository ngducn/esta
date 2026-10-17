'use client';

import type { IsoDate } from '@esta/core/date';
import { CERTIFICATE_FORMS, CERTIFICATE_STATUSES, type Certificate } from '@esta/core/schemas/legal';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { DateInput } from '@/components/date-input';
import { Group, TextField } from '@/components/form-parts';
import { FormSelect } from '@/components/properties/address-picker';
import { Button } from '@/components/ui/button';
import type { PartyOption } from '@/server/properties/legal';
import { AnnotationList, annotationDraft, readAnnotations, type AnnotationDraft } from './annotation-list';
import { LegalFormShell } from './legal-form-shell';
import { MortgageFields, mortgageDraft, readMortgage, type MortgageInvalid } from './mortgage-fields';
import { HolderPicker } from './party-picker';

export function CertificateForm({
  propertyId,
  itemId,
  initial,
  parties: initialParties,
}: {
  propertyId: string;
  itemId: string | null;
  initial: Certificate | null;
  parties: readonly PartyOption[];
}) {
  const t = useTranslations('propertyLegal');
  const [parties, setParties] = useState(initialParties);
  const [form, setForm] = useState<string>(initial?.form ?? 'gcn_2009_2024');
  const [serialNo, setSerialNo] = useState(initial?.serial_no ?? '');
  const [bookEntryNo, setBookEntryNo] = useState(initial?.book_entry_no ?? '');
  const [issuedOn, setIssuedOn] = useState<IsoDate | null>(initial?.issued_on ?? null);
  const [issuedBy, setIssuedBy] = useState(initial?.issued_by ?? '');
  const [holders, setHolders] = useState<readonly string[]>(initial?.holder_party_ids ?? []);
  const [status, setStatus] = useState(initial?.status ?? 'valid');
  const [mortgage, setMortgage] = useState(mortgageDraft(initial?.mortgage ?? null));
  const [showMortgage, setShowMortgage] = useState(initial?.mortgage != null);
  const [annotations, setAnnotations] = useState<readonly AnnotationDraft[]>(() => (initial?.annotations ?? []).map((annotation, index) => annotationDraft(index, annotation)));
  const [nextKey, setNextKey] = useState(annotations.length);
  const [invalid, setInvalid] = useState<MortgageInvalid | null>(null);
  const addParty = (party: PartyOption) => setParties((current) => [...current, party]);

  const submit = () => {
    const read = readMortgage(status, status === 'mortgaged' || showMortgage ? mortgage : mortgageDraft(null));
    if (!read.ok) {
      setInvalid(read.invalid);
      return null;
    }
    setInvalid(null);
    return {
      form,
      serial_no: serialNo,
      book_entry_no: bookEntryNo,
      issued_on: issuedOn,
      issued_by: issuedBy,
      holder_party_ids: holders,
      status,
      mortgage: read.value,
      annotations: readAnnotations(annotations),
    };
  };

  return (
    <LegalFormShell propertyId={propertyId} kind="certificates" itemId={itemId} read={submit}>
      <Group title={t('groupCertificate')}>
        <FormSelect
          label={t('formLabel')}
          testId="certificate-form-select"
          value={form}
          options={CERTIFICATE_FORMS.map((value) => ({ value, label: t('form', { form: value }) }))}
          onChange={setForm}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t('serialNo')} inputId="serial-no" value={serialNo} maxLength={40} className="figures" error={null} onChange={setSerialNo} />
          <TextField label={t('bookEntryNo')} value={bookEntryNo} maxLength={40} className="figures" error={null} onChange={setBookEntryNo} />
          <DateInput label={t('issuedOn')} {...(issuedOn === null ? {} : { defaultValue: issuedOn })} onValueChange={setIssuedOn} />
          <TextField label={t('issuedByLabel')} value={issuedBy} maxLength={300} error={null} onChange={setIssuedBy} />
        </div>
        <FormSelect
          label={t('statusLabel')}
          testId="certificate-status-select"
          value={status}
          options={CERTIFICATE_STATUSES.map((value) => ({ value, label: t('status', { status: value }) }))}
          onChange={(value) => setStatus(CERTIFICATE_STATUSES.find((option) => option === value) ?? status)}
        />
      </Group>
      <Group title={t('groupHolders')}>
        <HolderPicker parties={parties} selected={holders} onChange={setHolders} onParty={addParty} />
      </Group>
      <Group title={t('groupMortgage')}>
        {status === 'mortgaged' || showMortgage ? (
          <MortgageFields status={status} draft={mortgage} onChange={setMortgage} parties={parties} onParty={addParty} invalid={invalid} />
        ) : (
          <Button type="button" variant="outline" className="self-start" onClick={() => setShowMortgage(true)}>
            {t('addMortgage')}
          </Button>
        )}
      </Group>
      <Group title={t('groupAnnotations')}>
        <p className="text-small text-ink-muted">{t('annotationsHint')}</p>
        <AnnotationList
          drafts={annotations}
          onChange={setAnnotations}
          onAdd={() => {
            setAnnotations([...annotations, annotationDraft(nextKey)]);
            setNextKey(nextKey + 1);
          }}
        />
      </Group>
    </LegalFormShell>
  );
}
