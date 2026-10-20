'use client';

import type { ColumnPreset, DecodedStatement } from '@esta/core/matching';
import { FileSpreadsheet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type ChangeEvent, type FormEvent } from 'react';
import { FieldMessage } from '@/components/field-message';
import { FormSelect } from '@/components/properties/address-picker';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import type { FileColumns, Picks, StatementFile, StatementFileReason } from '@/lib/statements/decodeStatementFile';
import { useHydrated } from '@/lib/use-hydrated';
import { importStatement } from '@/server/actions/statements';
import type { MappingProblem } from './ColumnMapping';

// Only a file whose header Esta does not know opens the mapping, so its code loads with the first such file.
const ColumnMapping = dynamic(() => import('./ColumnMapping').then((module) => module.ColumnMapping));

export type AccountOption = { readonly id: string; readonly label: string };

/** How many decoded lines the mapping shows before a person confirms the columns. */
const SAMPLE_LINES = 5;

const FILE_ERRORS = {
  too_large: 'errorTooLarge',
  unsupported: 'errorUnsupported',
  unreadable: 'errorUnreadable',
} as const satisfies Record<StatementFileReason, string>;

type Reader = typeof import('@/lib/statements/decodeStatementFile');

/** The import id is minted with the file, so sending it again after a lost connection finds the import already made. */
type Chosen = { readonly name: string; readonly importId: string; readonly file: StatementFile; readonly reader: Reader };

/** The lines as the chosen columns read them, and whether Esta knew the header or a person chose the columns. */
type Read = { readonly decoded: DecodedStatement; readonly source: 'detected' | 'mapped' };

/** A chosen file: how its columns are known, the picks while the mapping is open, and what those columns read. */
type View = { readonly chosen: Chosen; readonly columns: FileColumns; readonly picks: Picks | null; readonly read: Read | null; readonly problem: MappingProblem | null };

/**
 * A file's lines under the labels Esta knows, else under the account's saved columns found again (LSE-8 preset), else
 * under the columns a person picks. A mapping that reads no line is a problem, so it is never sent or saved (P3-21).
 */
function viewOf(chosen: Chosen, preset: ColumnPreset | undefined, picks: Picks | null): View {
  const { file, reader } = chosen;
  const columns = reader.fileColumns(file, preset);
  const open = picks ?? (columns.kind === 'unknown' ? reader.firstPicks(file.grid, preset) : null);
  if (open === null && columns.kind !== 'unknown') {
    const decoded = file.decode(columns.header);
    return { chosen, columns, picks: null, read: decoded.ok ? { decoded: decoded.value, source: columns.kind === 'detected' ? 'detected' : 'mapped' } : null, problem: null };
  }
  const picked = open === null ? null : reader.pickedHeader(file.grid, open);
  if (picked === null || !picked.ok) return { chosen, columns, picks: open, read: null, problem: picked?.reason ?? 'incomplete' };
  const decoded = file.decode(picked.value);
  const read = decoded.ok ? { decoded: decoded.value, source: 'mapped' as const } : null;
  return { chosen, columns, picks: open, read, problem: read === null || read.decoded.rows.length === 0 ? 'no_rows' : null };
}

function importInput({ chosen }: View, read: Read, accountId: string) {
  const { headerRow, mapping, rows, rejected } = read.decoded;
  const header = chosen.reader.headerCells(chosen.file.grid, headerRow);
  return {
    import_id: chosen.importId,
    bank_account_id: accountId,
    file_name: chosen.name.slice(0, 255),
    column_mapping: { headerRow, header: header.slice(0, 100).map((cell) => cell.slice(0, 200)), mapping, source: read.source },
    rejected,
    rows: rows.map((row) => ({ ...row, description: row.description.slice(0, 1000), bankRef: row.bankRef.slice(0, 200) })),
  };
}

/** LSE-8: the browser reads the statement, so the file itself never reaches a server function; only its lines do. */
export function StatementUpload({ accounts, presets }: { accounts: readonly AccountOption[]; presets: Readonly<Record<string, ColumnPreset>> }) {
  const t = useTranslations('statements');
  const router = useRouter();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [view, setView] = useState<View | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [earlier, setEarlier] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const hydrated = useHydrated();
  const read = view?.problem === null ? view.read : null;
  const ready = read !== null && read.decoded.rows.length > 0;

  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    if (picked === undefined) return;
    setView(null);
    setError(null);
    setEarlier(null);
    setReading(true);
    // Offline, the reader's chunk may not load; that reads as a failed send, not as a bad file. The mapping's chunk loads
    // with it, so a file that needs the mapping never waits on the network for it.
    const loaded = await Promise.all([import('@/lib/statements/decodeStatementFile'), import('./ColumnMapping')])
      .then(async ([reader]) => ({ reader, file: await reader.decodeStatementFile(new Uint8Array(await picked.arrayBuffer()), picked.name) }))
      .catch(() => null);
    event.target.value = '';
    setReading(false);
    if (loaded === null) setError(t('errorFailed'));
    else if (!loaded.file.ok) setError(t(FILE_ERRORS[loaded.file.reason]));
    else if (!loaded.reader.holdsLines(loaded.file.value.grid)) setError(t('errorEmpty'));
    else {
      const next = viewOf({ name: picked.name, importId: crypto.randomUUID(), file: loaded.file.value, reader: loaded.reader }, presets[accountId], null);
      setView(next);
      if (next.picks === null && next.read?.decoded.rows.length === 0) setError(t('errorEmpty'));
    }
  };

  const changeAccount = (id: string) => {
    setAccountId(id);
    if (view === null) return;
    const still = view.chosen.reader.fileColumns(view.chosen.file, presets[id]).kind === 'unknown';
    setView(viewOf(view.chosen, presets[id], still ? view.picks : null));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (view === null || read === null || !ready) return;
    setError(null);
    startSaving(async () => {
      const result = await importStatement(importInput(view, read, accountId)).catch(() => ({ ok: false, reason: { kind: 'failed' } }) as const);
      if (result.ok) {
        router.push(`/collections/import/${result.value.import_id}${result.value.known > 0 ? `?known=${result.value.known}` : ''}`);
        return;
      }
      if (result.reason.kind === 'nothingNew') {
        setView(null);
        setEarlier(result.reason.importId);
      } else setError(t('errorFailed'));
    });
  };

  const counts =
    read === null ? null : (
      <span data-testid="statement-read" className="flex flex-col text-ink">
        <span className="break-words">{t('read', { file: view?.chosen.name ?? '', count: read.decoded.rows.length })}</span>
        {read.decoded.rejected.length === 0 ? null : <span className="text-ink-2">{t('readRefused', { count: read.decoded.rejected.length })}</span>}
      </span>
    );
  const columns = view?.columns;

  return (
    <form noValidate onSubmit={submit} data-testid="statement-upload" className="flex max-w-2xl flex-col gap-5 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
      <p className="max-w-prose text-body text-ink-2">{t('intro')}</p>
      {/* Before hydration a choice would revert to the default account, so the picker waits for React. */}
      <FormSelect
        label={t('account')}
        value={accountId}
        options={accounts.map((account) => ({ value: account.id, label: account.label }))}
        onChange={changeAccount}
        testId="statement-account"
        disabled={!hydrated || saving}
      />
      <div className="flex flex-col gap-2">
        <p className="text-body font-semibold text-ink">{t('file')}</p>
        <p className="text-small text-ink-muted">{t('fileHint')}</p>
        <label className={buttonVariants({ variant: 'outline', className: 'mt-1 w-fit cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent' })}>
          <FileSpreadsheet aria-hidden="true" />
          {view === null ? t('chooseFile') : t('chooseAnother')}
          <input
            type="file"
            data-testid="statement-file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={!hydrated}
            onChange={choose}
            className="sr-only"
          />
        </label>
        <FieldMessage id="statement-file-message" error={error}>
          {reading ? <span className="text-ink-muted">{t('reading')}</span> : null}
          {earlier === null ? null : (
            <span data-testid="statement-nothing-new" className="text-ink">
              {t('nothingNew')}
            </span>
          )}
          {view?.picks === null && ready ? counts : null}
        </FieldMessage>
        {view?.picks === null && columns?.kind === 'preset' ? (
          <p data-testid="statement-preset" className="flex flex-wrap items-center gap-x-3 text-body text-ink-2">
            {t('presetUsed')}
            <Button type="button" variant="quiet" data-testid="statement-preset-change" onClick={() => setView(viewOf(view.chosen, presets[accountId], view.chosen.reader.picksOf(columns.header)))}>
              {t('presetChange')}
            </Button>
          </p>
        ) : null}
        {earlier === null ? null : (
          <Link href={`/collections/import/${earlier}`} data-testid="statement-earlier" className={buttonVariants({ variant: 'quiet', className: 'w-fit' })}>
            {t('openEarlier')}
          </Link>
        )}
      </div>
      {view === null || view.picks === null ? null : (
        <ColumnMapping
          grid={view.chosen.file.grid}
          picks={view.picks}
          onPicks={(picks) => setView(viewOf(view.chosen, presets[accountId], picks))}
          preset={presets[accountId]}
          intro={view.columns.kind === 'unknown' ? (view.columns.mismatch ? 'mismatch' : 'new') : 'change'}
          sample={view.read?.decoded.rows.slice(0, SAMPLE_LINES) ?? []}
          problem={view.problem}
          counts={counts}
          disabled={saving}
        />
      )}
      <Button type="submit" disabled={!ready || saving} data-testid="statement-preview" className="w-fit">
        {saving ? t('previewing') : t('preview')}
      </Button>
    </form>
  );
}
