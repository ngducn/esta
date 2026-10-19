'use client';

import type { IsoDate } from '@esta/core/date';
import { formatArea, formatDate, formatVnd } from '@esta/core/format';
import type { LeaseMark } from '@esta/core/lease';
import type { Vnd } from '@esta/core/money';
import type { Unit } from '@esta/core/schemas/units';
import { ArrowDown, ArrowUp, FileSignature, FilePen, FileText, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { lazy, Suspense, useState, useTransition } from 'react';
import { deleteUnit, moveUnitAction, restoreUnit } from '@/app/(app)/properties/[id]/rental/actions';
import { MoneyDisplay } from '@/components/money/money-display';
import { StatusMark } from '@/components/status-mark';
import { buttonVariants } from '@/components/ui/button-variants';
import { useNoticeToast, useUndoToast } from '@/components/undo-toast';
import { cn } from '@/lib/utils';

const loadUnitSheet = () => import('./unit-sheet');
const loadAddRoomsSheet = () => import('./add-rooms-sheet');
const UnitSheet = lazy(loadUnitSheet);
const AddRoomsSheet = lazy(loadAddRoomsSheet);

/** A unit's `currentLease` as the Cho thuê tab shows it; `endsOn` is the termination date of a terminated one. */
export type UnitLease = {
  readonly mark: LeaseMark;
  readonly leaseId: string | null;
  readonly tenantName: string | null;
  readonly rentVnd: Vnd | null;
  readonly endsOn: IsoDate | null;
};

type Open = { readonly sheet: 'unit'; readonly unit: Unit | null } | { readonly sheet: 'rooms'; readonly existing: readonly string[] } | null;

const small = 'min-h-touch px-3 text-small';

/**
 * Rooms in the order Mẹ walks them. `Lên` and `Xuống` are words rather than drag handles, because a drag is hard on a
 * phone held in one hand. Delete sits in the edit sheet, away from the row, and the `whole` unit has none: the database
 * brings it back whenever none is left.
 */
export function UnitList({
  propertyId,
  units,
  leases,
  canEdit,
  roomingHouse,
}: {
  propertyId: string;
  units: readonly Unit[];
  leases: Readonly<Record<string, UnitLease>>;
  canEdit: boolean;
  roomingHouse: boolean;
}) {
  const t = useTranslations('propertyRental');
  const locale = useLocale();
  const router = useRouter();
  const showUndo = useUndoToast();
  const showNotice = useNoticeToast();
  const [open, setOpen] = useState<Open>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const move = (unit: Unit, direction: 'up' | 'down') =>
    startTransition(async () => {
      setError(null);
      const result = await moveUnitAction(propertyId, unit.id, direction).catch(() => ({ ok: false }) as const);
      if (result.ok) router.refresh();
      else setError(t('moveFailed'));
    });

  const remove = (unit: Unit) =>
    startTransition(async () => {
      setError(null);
      const result = await deleteUnit(propertyId, unit.id).catch(() => ({ ok: false }) as const);
      if (!result.ok) {
        setError('hasLeases' in result ? t('deleteHasLeases', { label: unit.label }) : t('deleteFailed'));
        return;
      }
      router.refresh();
      showUndo(t('deleted', { label: unit.label }), () => {
        restoreUnit(result.deleted)
          .then((restored) => (restored.ok ? router.refresh() : showNotice(t('restoreFailed'))))
          .catch(() => showNotice(t('restoreFailed')));
      });
    });

  const close = () => setOpen(null);

  return (
    <div className="flex flex-col gap-3">
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          {roomingHouse ? (
            <button
              type="button"
              data-testid="add-rooms"
              aria-haspopup="dialog"
              onPointerEnter={() => void loadAddRoomsSheet()}
              onFocus={() => void loadAddRoomsSheet()}
              onClick={() => setOpen({ sheet: 'rooms', existing: units.map((unit) => unit.label) })}
              className={buttonVariants({ variant: 'primary' })}
            >
              <Plus aria-hidden="true" />
              {t('addRooms')}
            </button>
          ) : null}
          <button
            type="button"
            data-testid="add-unit"
            aria-haspopup="dialog"
            onPointerEnter={() => void loadUnitSheet()}
            onFocus={() => void loadUnitSheet()}
            onClick={() => setOpen({ sheet: 'unit', unit: null })}
            className={buttonVariants({ variant: roomingHouse ? 'outline' : 'primary' })}
          >
            <Plus aria-hidden="true" />
            {t('addUnit')}
          </button>
        </div>
      ) : null}
      {error === null ? null : (
        <p role="alert" className="text-small text-overdue">
          {error}
        </p>
      )}
      <ol data-testid="unit-list" className="@container flex flex-col overflow-hidden rounded-lg border border-rule bg-surface shadow-card">
        {units.map((unit, index) => {
          const facts = [t('unitKind', { kind: unit.kind }), unit.area_m2 === null ? null : formatArea(unit.area_m2, locale)].filter((fact) => fact !== null);
          return (
            <li key={unit.id} data-testid="unit-row" data-id={unit.id} data-kind={unit.kind} className="flex flex-col gap-3 border-b border-rule p-4 last:border-b-0 sm:px-5 @3xl:flex-row @3xl:items-start @3xl:justify-between @3xl:gap-4">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 data-testid="unit-label" className="min-w-0 text-lead font-bold break-words text-ink">
                    {unit.label}
                  </h3>
                  {unit.list_rent_vnd === null ? (
                    <span className="text-small text-ink-muted">{t('noRent')}</span>
                  ) : (
                    <MoneyDisplay amount={unit.list_rent_vnd} className="text-lead font-semibold text-ink" />
                  )}
                </div>
                <p className="text-small text-ink-muted">{facts.join(' · ')}</p>
                <UnitLeaseLine lease={leases[unit.id]} />
                {unit.available_from === null || (leases[unit.id]?.mark.kind ?? 'vacant') !== 'vacant' ? null : (
                  <p data-testid="unit-available" className="text-small text-ink-2">
                    {t('availableFrom', { date: formatDate(unit.available_from, locale) })}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 @3xl:justify-end">
                <LeaseLink propertyId={propertyId} unit={unit} lease={leases[unit.id]} canEdit={canEdit} />
              {canEdit ? (
                <>
                  {units.length > 1 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => move(unit, 'up')}
                        disabled={pending || index === 0}
                        aria-label={t('moveUpLabel', { label: unit.label })}
                        className={cn(buttonVariants({ variant: 'outline' }), small)}
                      >
                        <ArrowUp aria-hidden="true" />
                        {t('moveUp')}
                      </button>
                      <button
                        type="button"
                        onClick={() => move(unit, 'down')}
                        disabled={pending || index === units.length - 1}
                        aria-label={t('moveDownLabel', { label: unit.label })}
                        className={cn(buttonVariants({ variant: 'outline' }), small)}
                      >
                        <ArrowDown aria-hidden="true" />
                        {t('moveDown')}
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    onPointerEnter={() => void loadUnitSheet()}
                    onClick={() => setOpen({ sheet: 'unit', unit })}
                    aria-label={t('editLabel', { label: unit.label })}
                    className={cn(buttonVariants({ variant: 'outline' }), small)}
                  >
                    <Pencil aria-hidden="true" />
                    {t('edit')}
                  </button>
                </>
              ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      <Suspense fallback={null}>
        {open?.sheet === 'unit' ? (
          <UnitSheet
            propertyId={propertyId}
            unit={open.unit}
            otherUnits={units.length - (open.unit === null ? 0 : 1)}
            onClose={close}
            onDelete={open.unit === null || open.unit.kind === 'whole' ? null : remove}
          />
        ) : null}
        {open?.sheet === 'rooms' ? <AddRoomsSheet propertyId={propertyId} existing={open.existing} onClose={close} /> : null}
      </Suspense>
    </div>
  );
}

function UnitLeaseLine({ lease }: { lease: UnitLease | undefined }) {
  const t = useTranslations('propertyRental');
  const locale = useLocale();
  if (lease === undefined) return null;
  const { mark } = lease;
  return (
    <div data-testid="unit-lease" data-mark={mark.kind} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1">
      {mark.kind === 'overdue' ? <StatusMark status="overdue" days={mark.days} /> : null}
      {mark.kind === 'due' ? <StatusMark status="due" /> : null}
      {mark.kind === 'draft' ? <StatusMark status="draft" /> : null}
      {mark.kind === 'vacant' ? <StatusMark status="vacant" /> : null}
      {lease.tenantName === null ? null : (
        <p data-testid="unit-tenant" className="text-body font-semibold break-words text-ink">
          {lease.tenantName}
        </p>
      )}
      {lease.rentVnd === null || mark.kind === 'vacant' ? null : (
        <p className="text-small text-ink-2">{t('tenantRent', { rent: formatVnd(lease.rentVnd, locale) })}</p>
      )}
      {mark.kind === 'upcoming' ? <p className="text-small text-ink-2">{t('nextDue', { date: formatDate(mark.dueDate, locale) })}</p> : null}
      {lease.endsOn === null ? null : (
        <p data-testid="unit-lease-ends" className="text-small text-ink-2">
          {t('leaseEnds', { date: formatDate(lease.endsOn, locale) })}
        </p>
      )}
    </div>
  );
}

/** `Thêm hợp đồng` on a unit with no live lease, `Tiếp tục` on a draft, and the lease itself otherwise. */
function LeaseLink({ propertyId, unit, lease, canEdit }: { propertyId: string; unit: Unit; lease: UnitLease | undefined; canEdit: boolean }) {
  const t = useTranslations('propertyRental');
  const base = `/properties/${propertyId}/rental/leases`;
  if (lease?.leaseId == null) {
    if (!canEdit) return null;
    return (
      <Link href={`${base}/new?unit=${unit.id}`} data-testid="add-lease" aria-label={t('addLeaseLabel', { label: unit.label })} className={cn(buttonVariants({ variant: 'primary' }), small)}>
        <FileSignature aria-hidden="true" />
        {t('addLease')}
      </Link>
    );
  }
  const draft = lease.mark.kind === 'draft';
  return (
    <Link
      href={`${base}/${lease.leaseId}`}
      data-testid={draft ? 'continue-lease' : 'open-lease'}
      aria-label={draft && canEdit ? t('continueLeaseLabel', { label: unit.label }) : t('openLeaseLabel', { label: unit.label })}
      className={cn(buttonVariants({ variant: 'outline' }), small)}
    >
      {draft ? <FilePen aria-hidden="true" /> : <FileText aria-hidden="true" />}
      {draft && canEdit ? t('continueLease') : t('openLease')}
    </Link>
  );
}
