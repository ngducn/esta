import 'server-only';
import { vnd } from '@esta/core/money';
import { VIETQR_RULES } from '@esta/core/vietqr';
import { formatVnd } from '@esta/core/format';
import { getTranslations } from 'next-intl/server';
import type { CSSProperties } from 'react';
import { z } from 'zod';
import { FAMILY, qrImage, renderPicturePng } from '@/server/receipts/png';
import { receiptHex as hex } from '@/server/receipts/kit';
import { cookielessAnonClient } from '@/server/supabase/server';
import { payableQr, type PayableQr } from './qr';

/** A bill a reminder links to (LSE-11): the code for what it still owes, or paid in full. */
export type SharedQr = { readonly kind: 'owed'; readonly qr: PayableQr } | { readonly kind: 'paid' };

const rowSchema = z.object({
  bank_bin: z.string(),
  bank_name: z.string(),
  account_no: z.string(),
  account_name: z.string(),
  outstanding_vnd: z.number().int().min(0).transform(vnd),
  memo_code: z.string(),
});

/** Read signed out, through `invoice_qr_by_token` alone, so the link reaches nothing but this bill's code. Null is a 404. */
export async function loadSharedQr(token: string): Promise<SharedQr | null> {
  const { data, error } = await cookielessAnonClient.rpc('invoice_qr_by_token', { p_token: token });
  if (error) throw new Error(`Reading a shared QR failed: ${error.message}`);
  const row = z.array(rowSchema).parse(data)[0];
  if (row === undefined) return null;
  const account = { bin: row.bank_bin, bankName: row.bank_name, accountNo: row.account_no, accountName: row.account_name };
  const qr = payableQr(account, row.outstanding_vnd, row.memo_code, 'vi');
  return qr === null ? { kind: 'paid' } : { kind: 'owed', qr };
}

const QR_PX = 720;
const muted: CSSProperties = { color: hex('ink-muted'), fontSize: 28 };

function Fact({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '14px 0', borderBottom: `1px solid ${hex('rule-strong')}` }}>
      <div style={muted}>{label}</div>
      <div style={{ display: 'flex', fontWeight: strong ? 700 : 400, fontSize: strong ? 44 : 34 }}>{value}</div>
    </div>
  );
}

type SharedQrT = Awaited<ReturnType<typeof getTranslations<'invoices'>>>;

function SharedQrPicture({ shared, t, paid }: { shared: SharedQr; t: SharedQrT; paid: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: 72, background: hex('surface'), color: hex('ink'), fontFamily: FAMILY, fontSize: 34, lineHeight: 1.45 }}>
      <div style={{ display: 'flex', fontWeight: 700, fontSize: 48, lineHeight: 1.3, marginBottom: 24 }}>{t('qrTitle')}</div>
      {shared.kind === 'paid' ? (
        <div style={{ display: 'flex', color: hex('paid'), fontWeight: 700, fontSize: 40 }}>{paid}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <img src={qrImage(shared.qr.payload)} width={QR_PX} height={QR_PX} alt={t('qrCode')} style={{ alignSelf: 'center' }} />
          <Fact label={t('qrAmount')} value={shared.qr.amountText} strong />
          {shared.qr.amountWords === null ? null : <Fact label={t('qrAmountWords')} value={shared.qr.amountWords} />}
          <Fact label={t('qrMemo')} value={shared.qr.memo} strong />
          <Fact label={t('qrBank')} value={shared.qr.bankName} />
          <Fact label={t('qrAccountNo')} value={shared.qr.accountNo} />
          <Fact label={t('qrAccountName')} value={shared.qr.accountName} />
          {shared.qr.amountWords === null ? null : (
            <div style={{ display: 'flex', marginTop: 24, fontSize: 30, color: hex('ink-2') }}>{t('qrSplitNote', { cap: formatVnd(VIETQR_RULES.singleTransferCapVnd, 'vi') })}</div>
          )}
        </div>
      )}
    </div>
  );
}

/** The picture `/q/<token>` serves: the code over what the payer's bank app will show, always in Vietnamese. */
export async function renderSharedQrPng(shared: SharedQr): Promise<Buffer> {
  const [t, receipt] = await Promise.all([getTranslations({ locale: 'vi', namespace: 'invoices' }), getTranslations({ locale: 'vi', namespace: 'receipt' })]);
  return renderPicturePng(<SharedQrPicture shared={shared} t={t} paid={receipt('paidInFull')} />);
}
