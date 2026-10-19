'use client';

import type { IsoDate } from '@esta/core/date';
import { formatArea, formatDate, formatVnd } from '@esta/core/format';
import type { LeaseMark } from '@esta/core/lease';
import type { Vnd } from '@esta/core/money';
import { compareRoomLabels } from '@esta/core/properties';
import type { Unit } from '@esta/core/schemas/units';
import { ArrowDown, ArrowDown01, ArrowUp, ArrowUpDown, Check, FileSignature, FilePen, FileText, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { lazy, Suspense, useEffect, useRef, useState, useTransition } from 'react';
import { deleteUnit, moveUnitAction, restoreUnit, sortUnitsByRoomNumber } from '@/app/(app)/properties/[id]/rental/actions';
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
type Direction = 'up' | 'down';

const small = 'min-h-touch px-3 text-small';

/**
 * Rooms in room-number order unless someone set another. Reordering is rare, so `Lên` and `Xuống` show only after
 * `Sắp xếp phòng`, and stay words rather than drag handles, because a drag is hard on a phone held in one hand. Delete
 * sits in the edit sheet, away from the row, and the `whole` unit has none: the database brings it back whenever none
 * is left.
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
  const [reorderOn, setReorderOn] = useState(false);
  const reordering = reorderOn && canEdit && units.length > 1;
  const inRoomOrder = units.every((unit, index) => {
    const before = units[index - 1];
    return before === undefined || compareRoomLabels(before.label, unit.label) <= 0;
  });
  const lastMove = useRef<{ readonly id: string; readonly direction: Direction } | null>(null);
  const list = useRef<HTMLOListElement>(null);

  // React moves one of the two swapped rows in the DOM, which drops focus when it is the row that moved down.
  useEffect(() => {
    const moved = lastMove.current;
    lastMove.current = null;
    if (moved === null || (document.activeElement !== null && document.activeElement !== document.body)) return;
    const buttons = [...(list.current?.querySelectorAll<HTMLButtonElement>(`[data-id="${moved.id}"] [data-move]`) ?? [])];
    (buttons.find((button) => button.dataset.move === moved.direction && !button.disabled) ?? buttons.find((button) => !button.disabled))?.focus();
  }, [units]);

  const reorder = (write: () => Promise<{ readonly ok: boolean }>) =>
    startTransition(async () => {
      setError(null);
      const result = await write().catch(() => ({ ok: false }) as const);
      if (result.ok) router.refresh();
      else setError(t('moveFailed'));
    });

  const move = (unit: Unit, direction: Direction) => {
    lastMove.current = { id: unit.id, direction };
    reorder(() => moveUnitAction(propertyId, unit.id, direction));
  };

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
          {reordering ? (
            <button
              type="button"
              data-testid="sort-by-number"
              onClick={() => reorder(() => sortUnitsByRoomNumber(propertyId))}
              disabled={pending || inRoomOrder}
              className={buttonVariants({ variant: 'outline' })}
            >
              <ArrowDown01 aria-hidden="true" />
              {t('sortByNumber')}
            </button>
          ) : null}
          {!reordering && roomingHouse ? (
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
          {reordering ? null : (
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
          )}
          {units.length > 1 ? (
            <button
              type="button"
              data-testid="reorder-rooms"
              onClick={() => setReorderOn(!reordering)}
              className={cn(buttonVariants({ variant: reordering ? 'primary' : 'outline' }), 'sm:ml-auto')}
            >
              {reordering ? <Check aria-hidden="true" /> : <ArrowUpDown aria-hidden="true" />}
              {reordering ? t('reorderDone') : t('reorder')}
            </button>
          ) : null}
        </div>
      ) : null}
      {reordering ? <p className="text-body text-ink-2">{t('reorderHint')}</p> : null}
      {error === null ? null : (
        <p role="alert" className="text-small text-overdue">
          {error}
        </p>
      )}
      <ol ref={list} data-testid="unit-list" className="@container flex flex-col overflow-hidden rounded-lg border border-rule bg-surface shadow-card">
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
              {reordering ? (
                <div className="ml-auto flex rounded-sm border border-rule-strong bg-surface @3xl:ml-0">
                  <MoveButton direction="up" label={unit.label} disabled={pending || index === 0} onMove={() => move(unit, 'up')} />
                  <MoveButton direction="down" label={unit.label} disabled={pending || index === units.length - 1} onMove={() => move(unit, 'down')} />
                </div>
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

function MoveButton({ direction, label, disabled, onMove }: { direction: Direction; label: string; disabled: boolean; onMove: () => void }) {
  const t = useTranslations('propertyRental');
  return (
    <button
      type="button"
      data-move={direction}
      onClick={onMove}
      disabled={disabled}
      aria-label={direction === 'up' ? t('moveUpLabel', { label }) : t('moveDownLabel', { label })}
      className={cn(
        'inline-flex min-h-touch min-w-touch items-center justify-center gap-1.5 px-3 text-small font-semibold text-ink transition-colors duration-(--duration-fast) ease-standard select-none',
        'first:rounded-l-sm last:rounded-r-sm not-first:border-l not-first:border-rule-strong hover:bg-surface-2 active:bg-rule disabled:cursor-not-allowed disabled:text-ink-muted disabled:hover:bg-transparent',
        '[&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0',
      )}
    >
      {direction === 'up' ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />}
      {direction === 'up' ? t('moveUp') : t('moveDown')}
    </button>
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
