import 'server-only';
import { Resvg } from '@resvg/resvg-js';
import type { CSSProperties, ReactNode } from 'react';
import satori from 'satori';
import { QR_QUIET_MODULES, qrMatrix } from '@/lib/qr';
import { PNG_PX, receiptFonts, receiptHex as hex, type Receipt } from './kit';

export const FAMILY = 'Receipt';
const QR_PX = 280;

/** The code as an SVG picture with its quiet zone, dark on white as bank apps expect. */
export function qrImage(payload: string): string {
  const { size, path } = qrMatrix(payload);
  const box = size + 2 * QR_QUIET_MODULES;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-QR_QUIET_MODULES} ${-QR_QUIET_MODULES} ${box} ${box}" shape-rendering="crispEdges"><rect x="${-QR_QUIET_MODULES}" y="${-QR_QUIET_MODULES}" width="${box}" height="${box}" fill="${hex('qr-paper')}"/><path d="${path}" fill="${hex('qr-ink')}"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

const muted: CSSProperties = { color: hex('ink-muted') };
const note: CSSProperties = { ...muted, fontSize: 26, marginTop: 8 };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 24, padding: '5px 0' }}>
      <div style={{ ...muted, width: 210, flexShrink: 0 }}>{label}</div>
      <div style={{ display: 'flex', flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

function Amount({ label, amount, strong = false, size = 30, ruled = false }: { label: string; amount: string; strong?: boolean; size?: number; ruled?: boolean }) {
  const rule: CSSProperties = ruled ? { borderBottom: `1px solid ${hex('rule-strong')}` } : {};
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 24, padding: '7px 0', fontWeight: strong ? 700 : 400, fontSize: size, ...rule }}>
      <div style={{ display: 'flex', flex: 1, minWidth: 0 }}>{label}</div>
      <div style={{ flexShrink: 0 }}>{amount}</div>
    </div>
  );
}

function Payment({ receipt }: { receipt: Receipt }) {
  if (receipt.paid) return <div style={{ display: 'flex', color: hex('paid'), fontWeight: 700, fontSize: 36 }}>{receipt.labels.paidInFull}</div>;
  if (receipt.qr === null) return null;
  return (
    <div style={{ display: 'flex', flex: 1, gap: 36, alignItems: 'center' }}>
      <img src={qrImage(receipt.qr.payload)} width={QR_PX} height={QR_PX} alt={receipt.labels.scanToPay} style={{ flexShrink: 0 }} />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, gap: 2 }}>
        <div style={{ fontWeight: 700 }}>{receipt.labels.scanToPay}</div>
        <div style={note}>{receipt.labels.memo}</div>
        <div style={{ fontWeight: 700, fontSize: 36 }}>{receipt.qr.memo}</div>
        <div style={note}>{receipt.labels.account}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 16 }}>
          <span>{receipt.qr.bank}</span>
          <span>{receipt.qr.accountNo}</span>
        </div>
        <div>{receipt.qr.accountName}</div>
      </div>
    </div>
  );
}

/** A5's shape at least; a bill with many lines makes the picture taller, so the code is never cut off or squeezed. */
function ReceiptPicture({ receipt }: { receipt: Receipt }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', minHeight: PNG_PX.height, padding: 80, background: hex('surface'), color: hex('ink'), fontFamily: FAMILY, fontSize: 30, lineHeight: 1.45 }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24, paddingBottom: 16, borderBottom: `3px solid ${hex('ink')}` }}>
          <div style={{ display: 'flex', flex: 1, minWidth: 0, fontWeight: 700, fontSize: 34 }}>{receipt.header}</div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, fontSize: 26, ...muted }}>
            <span>{receipt.labels.number}</span>
            <span>{receipt.number}</span>
          </div>
        </div>
        <div style={{ display: 'flex', fontWeight: 700, fontSize: 56, lineHeight: 1.3, marginTop: 32 }}>{receipt.title}</div>
        <div style={{ display: 'flex', gap: 8, fontSize: 26, marginTop: 4, marginBottom: 24, ...muted }}>
          <span>{receipt.labels.issuedOn}</span>
          <span>{receipt.issuedOn}</span>
        </div>
        <Field label={receipt.labels.tenant}>
          <span style={{ fontWeight: 700 }}>{receipt.tenant}</span>
        </Field>
        <Field label={receipt.labels.place}>{receipt.place}</Field>
        <Field label={receipt.labels.period}>{receipt.period}</Field>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 28 }}>
          <div style={{ display: 'flex', fontWeight: 700, fontSize: 32 }}>{receipt.labels.lines}</div>
          {receipt.lines.map((line, index) => (
            <Amount key={index} label={line.label} amount={line.amount} ruled />
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', borderTop: `3px solid ${hex('ink')}`, marginTop: 4 }}>
          <Amount label={receipt.labels.total} amount={receipt.total} strong size={40} />
          {receipt.totalWords === null ? null : (
            <div style={{ display: 'flex', gap: 10, color: hex('ink-2') }}>
              <span style={{ flexShrink: 0 }}>{receipt.labels.words}</span>
              <span>{receipt.totalWords}</span>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 12 }}>
            {receipt.received === null ? null : <Amount label={receipt.labels.received} amount={receipt.received} />}
            <Amount label={receipt.labels.outstanding} amount={receipt.outstanding} strong />
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', marginTop: receipt.paid ? 48 : 'auto', width: '100%' }}>
        <Payment receipt={receipt} />
      </div>
    </div>
  );
}

/** A picture 1080 px wide, sharp on a phone and sized for Zalo, drawn with the bundled fonts only (set `fontFamily: FAMILY`). */
export async function renderPicturePng(picture: ReactNode): Promise<Buffer> {
  const svg = await satori(picture, {
    width: PNG_PX.width,
    fonts: receiptFonts().map((font) => ({ name: FAMILY, data: font.data, weight: font.weight, style: 'normal' as const })),
  });
  return new Resvg(svg, { fitTo: { mode: 'width', value: PNG_PX.width }, font: { loadSystemFonts: false } }).render().asPng();
}

/** LSE-6: the receipt as a picture to send in Zalo. */
export function renderReceiptPng(receipt: Receipt): Promise<Buffer> {
  return renderPicturePng(<ReceiptPicture receipt={receipt} />);
}
