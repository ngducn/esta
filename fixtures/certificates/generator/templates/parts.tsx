import type { ReactElement, ReactNode } from 'react';
import { formatArea, formatDate } from '../../../../packages/core/src/format/index.ts';
import type { IsoDate } from '../../../../packages/core/src/index.ts';
import type { CertificateFacts } from '../facts.ts';

export const PAGE_WIDTH = 1000;
export const PAGE_HEIGHT = 1414;

/** Where each part of a certificate is printed; the truth's `page` of a field is the page that prints its section. */
export type Section = 'holders' | 'parcels' | 'structures' | 'serial_no' | 'book_entry_no' | 'issued' | 'annotations' | 'notes_text' | 'qr';

export type TemplatePage = {
  readonly sections: readonly Section[];
  readonly render: (facts: CertificateFacts, qrDataUrl: string | null) => ReactElement;
};

export type CertificateTemplate = {
  readonly pages: readonly TemplatePage[];
  /** `paper_only` is written by hand, so every filled-in field is marked handwritten in its truth. */
  readonly handwritten: boolean;
};

export type Palette = { readonly paper: string; readonly frame: string; readonly ink: string };

export const area = (squareMeters: number): string => formatArea(squareMeters, 'vi');

export const date = (value: IsoDate): string => formatDate(value, 'vi');

export function dateWords(value: IsoDate): string {
  const [year, month, day] = value.split('-');
  return `ngày ${day} tháng ${month} năm ${year}`;
}

export function Page({ palette, children }: { readonly palette: Palette; readonly children: ReactNode }): ReactElement {
  return (
    <div
      style={{
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        display: 'flex',
        padding: 28,
        background: palette.paper,
        color: palette.ink,
        fontFamily: 'Sans',
        fontSize: 21,
      }}
    >
      <div style={{ display: 'flex', flex: 1, border: `5px solid ${palette.frame}`, padding: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, border: `1.5px solid ${palette.frame}`, padding: '36px 44px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function NationalHeader(): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 22 }}>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
      <div style={{ fontWeight: 700, fontSize: 21, borderBottom: '1.5px solid currentColor', paddingBottom: 2 }}>
        Độc lập - Tự do - Hạnh phúc
      </div>
    </div>
  );
}

export function Title({ children, color }: { readonly children: ReactNode; readonly color: string }): ReactElement {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', textAlign: 'center', fontWeight: 700, fontSize: 30, color, margin: '12px 24px 24px' }}>
      {children}
    </div>
  );
}

export function Heading({ children }: { readonly children: ReactNode }): ReactElement {
  return <div style={{ display: 'flex', fontWeight: 700, fontSize: 23, margin: '18px 0 8px' }}>{children}</div>;
}

export function Field({ label, value }: { readonly label: string; readonly value: string | number | null }): ReactElement {
  return (
    <div style={{ display: 'flex', margin: '4px 0', lineHeight: 1.35 }}>
      <div style={{ display: 'flex', flexShrink: 0, marginRight: 8 }}>{`${label}:`}</div>
      <div style={{ display: 'flex', fontWeight: 700 }}>{value === null ? '-' : String(value)}</div>
    </div>
  );
}

export function Line({ children }: { readonly children: ReactNode }): ReactElement {
  return <div style={{ display: 'flex', margin: '4px 0', lineHeight: 1.4 }}>{children}</div>;
}

export function Table({ columns, rows }: { readonly columns: readonly string[]; readonly rows: readonly (readonly string[])[] }): ReactElement {
  const cell = { display: 'flex', flex: 1, padding: '6px 8px', borderRight: '1px solid currentColor' } as const;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid currentColor', borderRight: 'none', margin: '6px 0' }}>
      <div style={{ display: 'flex', fontWeight: 700, borderBottom: '1px solid currentColor' }}>
        {columns.map((column) => (
          <div key={column} style={cell}>
            {column}
          </div>
        ))}
      </div>
      {rows.map((row, index) => (
        <div key={index} style={{ display: 'flex', borderBottom: index === rows.length - 1 ? 'none' : '1px solid currentColor' }}>
          {row.map((value, column) => (
            <div key={column} style={cell}>
              {value}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function Signature({ place, issuedOn, issuedBy }: { readonly place: string; readonly issuedOn: IsoDate | null; readonly issuedBy: string | null }): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginTop: 28 }}>
      <div style={{ display: 'flex', fontStyle: 'italic' }}>{issuedOn === null ? place : `${place}, ${dateWords(issuedOn)}`}</div>
      <div style={{ display: 'flex', fontWeight: 700, marginTop: 6 }}>{issuedBy ?? ''}</div>
      <div style={{ display: 'flex', width: 150, height: 150, marginTop: 10, borderRadius: 75, border: '4px solid #c62828', opacity: 0.75 }} />
    </div>
  );
}

export function holderLine(holder: CertificateFacts['holders'][number], title: string): string {
  const born = holder.birth_year === null ? '' : `, sinh năm ${holder.birth_year}`;
  return `${title} ${holder.full_name}${born}, CCCD số ${holder.id_number}`;
}

/** The place before the signature date, such as `Bình Dương` from `..., tỉnh Bình Dương`. */
export function provinceOf(facts: CertificateFacts): string {
  const last = facts.parcels[0]?.address_text.split(', ').at(-1) ?? '';
  return last.replace(/^(tỉnh|thành phố|Thành phố)\s+/u, '');
}
