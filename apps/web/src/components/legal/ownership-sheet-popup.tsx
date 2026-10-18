'use client';

import type { IsoDate } from '@esta/core/date';
import { bpToPercentText, formatShareBp, ownershipStatus, percentToBp, FULL_SHARE_BP } from '@esta/core/properties/ownership';
import type { OwnershipShare } from '@esta/core/schemas/ownership';
import { usedNewParties } from '@esta/core/schemas/party';
import { X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState, useTransition, type FormEvent, type RefObject } from 'react';
import { saveOwnershipShares } from '@/app/(app)/properties/[id]/legal/actions';
import { DateInput } from '@/components/date-input';
import { TextField } from '@/components/form-parts';
import { StatusShape } from '@/components/status-mark';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import type { PartyOption } from '@/server/properties/legal';
import { PartyAdder } from './party-picker';
import { useNewParties } from './use-new-parties';

export type OwnershipSheetProps = {
  propertyId: string;
  shares: readonly OwnershipShare[];
  parties: readonly PartyOption[];
  /** Parties on any of the property's certificates; a newly added owner starts `Có tên trên sổ` when listed here. */
  holderIds: readonly string[];
};

type Draft = { key: number; partyId: string; percent: string; named: boolean; since: IsoDate | null };

/** The total of the percents that parse; a field still being typed counts as nothing until it does. */
function draftStatus(drafts: readonly Draft[]) {
  return ownershipStatus(
    drafts.flatMap((draft) => {
      const result = percentToBp(draft.percent);
      return result.ok ? [{ share_bp: result.value }] : [];
    }),
  );
}

function OwnerRow({
  draft,
  name,
  error,
  onChange,
  onRemove,
}: {
  draft: Draft;
  name: string;
  error: string | null;
  onChange: (draft: Draft) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('propertyOwners');
  const namedId = useId();
  return (
    <li data-testid="owner-draft" data-party={draft.partyId} className="border-t border-rule pt-4 first:border-t-0 first:pt-0">
      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="sr-only">{name}</legend>
        <div className="flex items-start justify-between gap-3">
          <p aria-hidden="true" className="min-w-0 pt-2.5 text-lead font-bold break-words text-ink">
            {name}
          </p>
          <Button type="button" variant="quiet" aria-label={t('removeLabel', { name })} onClick={onRemove} data-testid="owner-remove">
            <X aria-hidden="true" />
            {t('remove')}
          </Button>
        </div>
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <TextField
            label={t('shareLabel')}
            testId="owner-share"
            value={draft.percent}
            maxLength={8}
            inputMode="decimal"
            className="figures w-32"
            error={error}
            onChange={(percent) => onChange({ ...draft, percent })}
          />
          <div className="flex min-h-touch items-center gap-1 sm:mt-8">
            <Checkbox
              id={namedId}
              checked={draft.named}
              onCheckedChange={(named) => onChange({ ...draft, named })}
              data-testid="owner-named"
            />
            <label htmlFor={namedId} className="text-body text-ink">
              {t('named')}
            </label>
          </div>
        </div>
        <DateInput
          label={t('sinceLabel')}
          {...(draft.since === null ? {} : { defaultValue: draft.since })}
          onValueChange={(since) => onChange({ ...draft, since })}
        />
      </fieldset>
    </li>
  );
}

function OwnershipForm({ propertyId, shares, parties: initialParties, holderIds, onSaved }: OwnershipSheetProps & { onSaved: () => void }) {
  const t = useTranslations('propertyOwners');
  const locale = useLocale();
  const { parties, pending: newParties, add: addParty } = useNewParties(initialParties);
  const [drafts, setDrafts] = useState<readonly Draft[]>(() =>
    shares.map((share, index) => ({
      key: index,
      partyId: share.party_id,
      percent: bpToPercentText(share.share_bp, locale),
      named: share.named_on_certificate,
      since: share.since,
    })),
  );
  const [showErrors, setShowErrors] = useState(false);
  const [failed, setFailed] = useState(false);
  const [partyHoldsId, setPartyHoldsId] = useState(false);
  const [pending, startTransition] = useTransition();

  const byId = new Map(parties.map((party) => [party.id, party]));
  const parsed = drafts.map((draft) => percentToBp(draft.percent));
  const total = draftStatus(drafts);
  const available = parties.filter((party) => !party.isBank && !drafts.some((draft) => draft.partyId === party.id));

  const add = (partyId: string) => {
    setDrafts((current) => {
      const missing = FULL_SHARE_BP - draftStatus(current).totalBp;
      const percent = missing > 0 ? bpToPercentText(missing, locale) : '';
      const key = Math.max(-1, ...current.map((draft) => draft.key)) + 1;
      return [...current, { key, partyId, percent, named: holderIds.includes(partyId), since: null }];
    });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const values = drafts.flatMap((draft, index) => {
      const result = parsed[index];
      return result?.ok ? [{ party_id: draft.partyId, share_bp: result.value, named_on_certificate: draft.named, since: draft.since }] : [];
    });
    if (values.length !== drafts.length) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    setFailed(false);
    setPartyHoldsId(false);
    startTransition(async () => {
      const result = await saveOwnershipShares(propertyId, values, usedNewParties(newParties, values.map((value) => value.party_id))).catch(() => ({ ok: false, reason: 'failed' }) as const);
      if (result.ok) onSaved();
      else if (result.reason === 'invalid') setShowErrors(true);
      else if (result.reason === 'national_id') setPartyHoldsId(true);
      else setFailed(true);
    });
  };

  const running =
    total.state === 'complete'
      ? null
      : total.state === 'under'
        ? t('runningShort', { missing: formatShareBp(FULL_SHARE_BP - total.totalBp, locale) })
        : t('runningOver', { extra: formatShareBp(total.totalBp - FULL_SHARE_BP, locale) });

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5" data-testid="ownership-form">
      {drafts.length === 0 ? (
        <p className="text-body text-ink-muted">{t('noRows')}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {drafts.map((draft, index) => {
            const result = parsed[index];
            const error = !showErrors || result === undefined || result.ok ? null : result.reason === 'range' ? t('shareRange') : t('shareInvalid');
            return (
              <OwnerRow
                key={draft.key}
                draft={draft}
                name={byId.get(draft.partyId)?.fullName ?? t('unknownParty')}
                error={error}
                onChange={(next) => setDrafts(drafts.map((other) => (other.key === draft.key ? next : other)))}
                onRemove={() => setDrafts(drafts.filter((other) => other.key !== draft.key))}
              />
            );
          })}
        </ul>
      )}
      <div className="flex flex-col gap-3 border-t border-rule pt-4">
        <PartyAdder
          parties={available}
          labels={{ choose: t('choose'), add: t('addPerson') }}
          onPick={add}
          onParty={addParty}
        />
      </div>
      <div className="sticky -bottom-[max(--spacing(6),env(safe-area-inset-bottom))] -mx-6 -mb-6 flex flex-col gap-3 border-t border-rule bg-surface px-6 pt-4 pb-[max(--spacing(6),env(safe-area-inset-bottom))]">
        <p data-testid="ownership-running-total" className="flex flex-wrap items-center gap-x-2 rounded-md bg-surface-2 px-3 py-2 text-body text-ink">
          {running === null ? <StatusShape status="paid" className="size-4" /> : <StatusShape status="due" className="size-4" />}
          <span className="figures font-semibold">{t('runningTotal', { total: formatShareBp(total.totalBp, locale) })}</span>
          {running === null ? null : <span className="figures text-ink-2">{running}</span>}
        </p>
        {showErrors || failed || partyHoldsId ? (
          <p role="alert" data-testid="ownership-error" className="flex items-start gap-2 text-body text-overdue">
            <StatusShape status="overdue" className="mt-1 size-4" />
            <span className="wrap-anywhere">{partyHoldsId ? t('partyNationalId') : failed ? t('failed') : t('invalid')}</span>
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-3 sm:flex sm:justify-end">
          <SheetClose render={<Button type="button" variant="outline" />}>{t('cancel')}</SheetClose>
          <Button type="submit" disabled={pending} data-testid="save-ownership">
            {t('save')}
          </Button>
        </div>
      </div>
    </form>
  );
}

export default function OwnershipSheetPopup({
  open,
  onOpenChange,
  finalFocus,
  ...props
}: OwnershipSheetProps & { open: boolean; onOpenChange: (open: boolean) => void; finalFocus: RefObject<HTMLButtonElement | null> }) {
  const t = useTranslations('propertyOwners');
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent finalFocus={finalFocus} data-testid="ownership-sheet">
        <div className="flex flex-col gap-1">
          <SheetTitle>{t('sheetTitle')}</SheetTitle>
          <SheetDescription>{t('sheetBody')}</SheetDescription>
        </div>
        <OwnershipForm {...props} onSaved={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}
