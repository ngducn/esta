'use client';

import { FileSpreadsheet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type ChangeEvent, type FormEvent } from 'react';
import { FieldMessage } from '@/components/field-message';
import { FormSelect } from '@/components/properties/address-picker';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import type { DecodedStatementFile, StatementFileReason } from '@/lib/statements/decodeStatementFile';
import { useHydrated } from '@/lib/use-hydrated';
import { importStatement } from '@/server/actions/statements';

export type AccountOption = { readonly id: string; readonly label: string };

const FILE_ERRORS = {
  no_header: 'errorNoHeader',
  too_large: 'errorTooLarge',
  unsupported: 'errorUnsupported',
  unreadable: 'errorUnreadable',
} as const satisfies Record<StatementFileReason, string>;

/** The import id is minted with the file, so sending it again after a lost connection finds the import already made. */
type Chosen = { readonly name: string; readonly importId: string; readonly decoded: DecodedStatementFile };

function importInput(chosen: Chosen, accountId: string) {
  const { headerRow, header, mapping, rows, rejected } = chosen.decoded;
  return {
    import_id: chosen.importId,
    bank_account_id: accountId,
    file_name: chosen.name.slice(0, 255),
    column_mapping: { headerRow, header: header.slice(0, 100).map((cell) => cell.slice(0, 200)), mapping },
    rejected,
    rows: rows.map((row) => ({ ...row, description: row.description.slice(0, 1000), bankRef: row.bankRef.slice(0, 200) })),
  };
}

/** LSE-8: the browser reads the statement, so the file itself never reaches a server function; only its lines do. */
export function StatementUpload({ accounts }: { accounts: readonly AccountOption[] }) {
  const t = useTranslations('statements');
  const router = useRouter();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [earlier, setEarlier] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const hydrated = useHydrated();

  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    setChosen(null);
    setError(null);
    setEarlier(null);
    setReading(true);
    // Offline, the reader's chunk may not load; that reads as a failed send, not as a bad file.
    const decoded = await import('@/lib/statements/decodeStatementFile')
      .then(async ({ decodeStatementFile }) => decodeStatementFile(new Uint8Array(await file.arrayBuffer()), file.name))
      .catch(() => null);
    event.target.value = '';
    setReading(false);
    if (decoded === null) setError(t('errorFailed'));
    else if (!decoded.ok) setError(t(FILE_ERRORS[decoded.reason]));
    else if (decoded.value.rows.length === 0) setError(t('errorEmpty'));
    else setChosen({ name: file.name, importId: crypto.randomUUID(), decoded: decoded.value });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (chosen === null) return;
    setError(null);
    startSaving(async () => {
      const result = await importStatement(importInput(chosen, accountId)).catch(() => ({ ok: false, reason: { kind: 'failed' } }) as const);
      if (result.ok) {
        router.push(`/collections/import/${result.value.import_id}${result.value.known > 0 ? `?known=${result.value.known}` : ''}`);
        return;
      }
      if (result.reason.kind === 'nothingNew') {
        setChosen(null);
        setEarlier(result.reason.importId);
      } else setError(t('errorFailed'));
    });
  };

  return (
    <form noValidate onSubmit={submit} data-testid="statement-upload" className="flex max-w-2xl flex-col gap-5 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
      <p className="max-w-prose text-body text-ink-2">{t('intro')}</p>
      {/* Before hydration a choice would revert to the default account, so the picker waits for React. */}
      <FormSelect
        label={t('account')}
        value={accountId}
        options={accounts.map((account) => ({ value: account.id, label: account.label }))}
        onChange={setAccountId}
        testId="statement-account"
        disabled={!hydrated}
      />
      <div className="flex flex-col gap-2">
        <p className="text-body font-semibold text-ink">{t('file')}</p>
        <p className="text-small text-ink-muted">{t('fileHint')}</p>
        <label className={buttonVariants({ variant: 'outline', className: 'mt-1 w-fit cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent' })}>
          <FileSpreadsheet aria-hidden="true" />
          {chosen === null ? t('chooseFile') : t('chooseAnother')}
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
          {chosen === null ? null : (
            <span data-testid="statement-read" className="flex flex-col text-ink">
              <span className="break-words">{t('read', { file: chosen.name, count: chosen.decoded.rows.length })}</span>
              {chosen.decoded.rejected.length === 0 ? null : <span className="text-ink-2">{t('readRefused', { count: chosen.decoded.rejected.length })}</span>}
            </span>
          )}
        </FieldMessage>
        {earlier === null ? null : (
          <Link href={`/collections/import/${earlier}`} data-testid="statement-earlier" className={buttonVariants({ variant: 'quiet', className: 'w-fit' })}>
            {t('openEarlier')}
          </Link>
        )}
      </div>
      <Button type="submit" disabled={chosen === null || saving} data-testid="statement-preview" className="w-fit">
        {saving ? t('previewing') : t('preview')}
      </Button>
    </form>
  );
}
