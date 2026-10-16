import { formatVnd, type Locale } from '@esta/core/format';
import { vnd } from '@esta/core/money';
import {
  DECODE_ONLY_VECTORS,
  ENCODE_VECTORS,
  ESTA_INVOICE,
  MALFORMED_VECTORS,
  buildInvoiceQr,
  crc16CcittFalse,
  decodeVietQr,
  describeDecodeFault,
  encodeVietQr,
  invoiceMemo,
  parseTlv,
  type VietQr,
  type VietQrInput,
} from '@esta/core/vietqr';
import { getLocale, getTranslations } from 'next-intl/server';
import { VietQrScan } from './vietqr-scan';

type Example = {
  id: string;
  label: string;
  payload: string;
  tag01: string;
  tag54: string;
  decoded: string;
  reencoded: 'match' | 'mismatch' | null;
  note?: string;
};

const ACCOUNT = ESTA_INVOICE.input.account;
const OVERDUE = { account: ACCOUNT, outstandingVnd: vnd(7_000_000), memoCode: 'Q4ZT8N2V' };

function inputOf({ bin, accountNo, amountVnd, purpose, billNumber }: VietQr): VietQrInput {
  return {
    bin,
    accountNo,
    ...(amountVnd !== undefined && { amountVnd }),
    ...(purpose !== undefined && { purpose }),
    ...(billNumber !== undefined && { billNumber }),
  };
}

function rootTag(payload: string, tag: string): string | undefined {
  const parsed = parseTlv(payload);
  return parsed.ok ? parsed.value.get(tag) : undefined;
}

function attempt(encode: () => string): string | { refusal: string } {
  try {
    return encode();
  } catch (error) {
    return { refusal: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  }
}

function amountWithZeroPaddedCrc(): { amountVnd: number; payload: string } {
  for (let amountVnd = 1; ; amountVnd++) {
    const payload = encodeVietQr({ bin: ACCOUNT.bin, accountNo: ACCOUNT.accountNo, amountVnd: vnd(amountVnd) });
    if (crc16CcittFalse(payload.slice(0, -4)) < 0x1000) return { amountVnd, payload };
  }
}

export async function VietQrSection() {
  const [t, locale] = await Promise.all([getTranslations('devVietqr'), getLocale()]);
  const money = (amount: number) => formatVnd(vnd(amount), locale as Locale);

  function describe(decoded: ReturnType<typeof decodeVietQr>): string {
    if (!decoded.ok) return t('refused', { reason: describeDecodeFault(decoded.fault) });
    const { bin, accountNo, amountVnd, purpose } = decoded.value;
    return [bin, accountNo, amountVnd === undefined ? t('none') : money(amountVnd), purpose ?? t('none')].join(' · ');
  }

  function example(id: string, label: string, encoded: string | { refusal: string }, expected?: string, note?: string): Example {
    if (typeof encoded !== 'string') {
      return { id, label, payload: '', tag01: '', tag54: '', decoded: t('refused', { reason: encoded.refusal }), reencoded: null, ...(note && { note }) };
    }
    const decoded = decodeVietQr(encoded);
    const reencoded = expected === undefined || !decoded.ok ? null : encodeVietQr(inputOf(decoded.value)) === expected ? 'match' : 'mismatch';
    return {
      id,
      label,
      payload: encoded,
      tag01: rootTag(encoded, '01') ?? '',
      tag54: rootTag(encoded, '54') ?? t('none'),
      decoded: describe(decoded),
      reencoded,
      ...(note && { note }),
    };
  }

  const canonical = buildInvoiceQr(ESTA_INVOICE.input);
  const canonicalDecoded = decodeVietQr(canonical.payload);
  const overdue = buildInvoiceQr(OVERDUE);
  const crcPad = amountWithZeroPaddedCrc();
  const capNote = t('splitNote', { cap: money(500_000_000) });

  const examples: Example[] = [
    ...ENCODE_VECTORS.map((v) => example(v.id, t('vector', { id: v.id }), v.payload, v.payload)),
    ...DECODE_ONLY_VECTORS.map((v) => example(v.id, t('cardVector', { id: v.id }), v.payload)),
    ...MALFORMED_VECTORS.map((v) => example(v.id, t('malformed', { id: v.id }), v.payload)),
    example('crc-pad', t('crcPad', { amount: money(crcPad.amountVnd) }), crcPad.payload, crcPad.payload),
    example('no-amount', t('noAmount'), encodeVietQr({ bin: ACCOUNT.bin, accountNo: ACCOUNT.accountNo, purpose: invoiceMemo('7K2QX9MP') })),
    example('below-cap', t('belowCap'), buildInvoiceQr({ account: ACCOUNT, outstandingVnd: vnd(499_999_999), memoCode: '7K2QX9MP' }).payload),
    example('at-cap', t('atCap'), buildInvoiceQr({ account: ACCOUNT, outstandingVnd: vnd(500_000_000), memoCode: '7K2QX9MP' }).payload, undefined, capNote),
    example('above-cap', t('aboveCap'), buildInvoiceQr({ account: ACCOUNT, outstandingVnd: vnd(600_000_000), memoCode: '7K2QX9MP' }).payload, undefined, capNote),
    example('long-purpose', t('longPurpose'), attempt(() => encodeVietQr({ bin: ACCOUNT.bin, accountNo: ACCOUNT.accountNo, purpose: 'X'.repeat(26) }))),
    example('overdue', t('overdue'), overdue.payload),
  ];

  const scanLabels = { scan: t('scan'), match: t('match'), mismatch: t('mismatch'), pending: t('pending') };
  const columns = [t('example'), t('payload'), t('tag01'), t('tag54'), t('decoded'), t('reencoded')];

  return (
    <section aria-labelledby="vietqr-heading" data-section="vietqr" className="flex flex-col gap-4">
      <h2 id="vietqr-heading" className="text-lead font-semibold">
        {t('title')}
      </h2>
      <p className="text-small text-ink-muted">{t('intro')}</p>

      <div className="grid gap-6 sm:grid-cols-2">
        <figure data-testid="vietqr-canonical" data-payload={canonical.payload} className="flex flex-col gap-3">
          <figcaption className="font-semibold">{t('canonical')}</figcaption>
          <VietQrScan id="vietqr-canonical" payload={canonical.payload} labels={scanLabels} />
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-small tabular-nums">
            <dt>{t('bin')}</dt>
            <dd data-field="bin">{canonicalDecoded.ok ? canonicalDecoded.value.bin : ''}</dd>
            <dt>{t('account')}</dt>
            <dd data-field="accountNo">{canonicalDecoded.ok ? canonicalDecoded.value.accountNo : ''}</dd>
            <dt>{t('accountName')}</dt>
            <dd data-field="accountName">{ACCOUNT.accountName}</dd>
            <dt>{t('amount')}</dt>
            <dd data-field="amount">{canonicalDecoded.ok && canonicalDecoded.value.amountVnd !== undefined ? money(canonicalDecoded.value.amountVnd) : t('none')}</dd>
            <dt>{t('purpose')}</dt>
            <dd data-field="purpose">{canonicalDecoded.ok ? canonicalDecoded.value.purpose : ''}</dd>
            <dt>{t('tag01')}</dt>
            <dd data-field="tag01">{rootTag(canonical.payload, '01')}</dd>
            <dt>{t('payload')}</dt>
            <dd data-field="payload" className="wrap-anywhere font-mono">
              {canonical.payload}
            </dd>
          </dl>
          <p data-testid="vietqr-crc" data-match={canonicalDecoded.ok ? 'match' : 'mismatch'} className="text-small">
            {canonicalDecoded.ok ? t('crcMatch') : t('crcMismatch')}
          </p>
        </figure>

        <figure data-testid="vietqr-overdue" data-payload={overdue.payload} className="flex flex-col gap-3">
          <figcaption className="font-semibold">{t('overdue')}</figcaption>
          <VietQrScan id="vietqr-overdue" payload={overdue.payload} labels={scanLabels} />
          <p className="wrap-anywhere font-mono text-small">{overdue.payload}</p>
        </figure>
      </div>

      <h3 className="font-semibold">{t('examples')}</h3>
      <table className="w-full text-left text-small max-sm:block">
        <thead className="max-sm:sr-only">
          <tr className="border-b">
            {columns.map((column) => (
              <th key={column} scope="col" className="py-1 pr-4">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums max-sm:block">
          {examples.map((row) => {
            const cells: [string, string, string][] = [
              ['label', columns[0] ?? '', row.label],
              ['payload', columns[1] ?? '', row.payload],
              ['tag01', columns[2] ?? '', row.tag01],
              ['tag54', columns[3] ?? '', row.tag54],
              ['decoded', columns[4] ?? '', row.note ? `${row.decoded} · ${row.note}` : row.decoded],
              ['reencoded', columns[5] ?? '', row.reencoded === null ? '' : row.reencoded === 'match' ? t('match') : t('mismatch')],
            ];
            return (
              <tr
                key={row.id}
                data-example={row.id}
                data-match={row.reencoded ?? undefined}
                className="border-b align-top max-sm:grid max-sm:grid-cols-[auto_1fr] max-sm:gap-x-3 max-sm:py-2"
              >
                {cells.map(([cell, label, value]) => (
                  <td key={cell} className={`py-1 pr-4 wrap-anywhere ${value === '' ? 'max-sm:hidden' : 'max-sm:contents'}`}>
                    <span aria-hidden="true" className="font-sans font-normal text-meta sm:hidden">
                      {label}
                    </span>
                    <span data-cell={cell} className={cell === 'payload' ? 'font-mono' : ''}>
                      {value}
                    </span>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
