import 'server-only';
import { collectionState } from '@esta/core/collections';
import type { IsoDate } from '@esta/core/date';
import { formatPhone, normalizePhone, zaloChatUrl } from '@esta/core/phone';
import { defaultFormOfAddress, FORM_OF_ADDRESS_KEYS, reminderTiming, type FormOfAddress, type ReminderInput } from '@esta/core/reminder';
import { getTranslations } from 'next-intl/server';
import type { CollectionRow, OwedBill } from '@/server/collections/load';

/** What `Nhắc qua Zalo` needs to draft a row's reminder in the browser, where Mẹ picks the form of address. */
export type ReminderTarget = {
  readonly draft: Omit<ReminderInput, 'form' | 'qrUrl'>;
  readonly defaultForm: FormOfAddress;
  /** `/q/<token>`, made absolute on the page's own origin; null when the household has no receiving account. */
  readonly qrPath: string | null;
  /** The chat to open, from the tenant's Zalo number, else their phone; null when neither reads as a Vietnamese number. */
  readonly zalo: { readonly url: string; readonly phone: string } | null;
};

export type ReminderLabels = {
  readonly form: string;
  readonly forms: readonly { readonly key: FormOfAddress; readonly label: string }[];
  readonly text: string;
  readonly copy: string;
  readonly copied: string;
  readonly copyFailed: string;
  readonly openZalo: string;
  readonly noPhone: string;
  readonly assumption: string;
  readonly zaloNote: string;
  readonly close: string;
};

function zaloContact(tenant: NonNullable<OwedBill['tenant']>): ReminderTarget['zalo'] {
  for (const stored of [tenant.zaloPhone, tenant.phone]) {
    const phone = stored === null ? null : normalizePhone(stored);
    if (phone?.ok) return { url: zaloChatUrl(phone.value), phone: formatPhone(phone.value) };
  }
  return null;
}

/**
 * LSE-11: the reminder of every board row still owed to a tenant, keyed by invoice. The place is named in Vietnamese
 * whatever the screen's language, because the tenant reads the reminder.
 */
export async function boardReminders(rows: readonly CollectionRow[], owed: ReadonlyMap<string, OwedBill>, today: IsoDate, hasAccount: boolean): Promise<Map<string, ReminderTarget>> {
  const vi = await getTranslations({ locale: 'vi', namespace: 'collections' });
  return new Map(
    rows.flatMap((row) => {
      const bill = owed.get(row.invoiceId);
      const timing = reminderTiming(collectionState(row, today));
      if (bill?.tenant == null || row.tenantName === null || timing === null) return [];
      const target: ReminderTarget = {
        draft: {
          timing,
          tenantName: row.tenantName,
          place: row.wholeUnit ? row.propertyName : vi('place', { unit: row.unitLabel, property: row.propertyName }),
          periodStart: bill.periodStart,
          periodEnd: bill.periodEnd,
          dueDate: row.dueDate,
          amountVnd: row.outstandingVnd,
        },
        defaultForm: defaultFormOfAddress(bill.tenant.kind),
        qrPath: hasAccount && bill.shareToken !== null ? `/q/${bill.shareToken}` : null,
        zalo: zaloContact(bill.tenant),
      };
      return [[row.invoiceId, target] as const];
    }),
  );
}

/** The sheet's words in the screen's language, handed to the client sheet as props. */
export async function loadReminderLabels(): Promise<ReminderLabels> {
  const t = await getTranslations('collections');
  return {
    form: t('reminderForm'),
    forms: FORM_OF_ADDRESS_KEYS.map((key) => ({ key, label: t('reminderFormOption', { form: key }) })),
    text: t('reminderText'),
    copy: t('reminderCopy'),
    copied: t('reminderCopied'),
    copyFailed: t('reminderCopyFailed'),
    openZalo: t('reminderOpenZalo'),
    noPhone: t('reminderNoPhone'),
    assumption: t('reminderAssumption'),
    zaloNote: t('reminderZaloNote'),
    close: t('reminderClose'),
  };
}
