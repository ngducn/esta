import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import React from 'react';
import { fontBuf, receipt, total, totalWords, fmtVnd, qrDataUrl } from './data.ts';

const W = 540;
const H = Math.round((W * 210) / 148);

export async function renderPng(width = 1080): Promise<Buffer> {
  const qr = await qrDataUrl();
  const row = { display: 'flex', justifyContent: 'space-between', padding: '6px 0' } as const;
  const mute = { color: '#6b5f58' } as const;
  const tree = (
    <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', padding: 36, background: '#fbf8f3', color: '#2a2320', fontFamily: 'BVP', fontSize: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #2a2320', paddingBottom: 10 }}>
        <div style={{ fontFamily: 'News', fontWeight: 700, fontSize: 22 }}>{receipt.household}</div>
        <div style={mute}>{`Số ${receipt.no}`}</div>
      </div>
      <div style={{ fontFamily: 'News', fontWeight: 700, fontSize: 32, margin: '20px 0 12px' }}>{receipt.title}</div>
      <div style={row}><div style={mute}>Người thuê</div><div>{receipt.tenant}</div></div>
      <div style={row}><div style={mute}>Căn thuê</div><div>{receipt.unit}</div></div>
      <div style={row}><div style={mute}>Kỳ</div><div>{`${receipt.periodFrom} đến ${receipt.periodTo}`}</div></div>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 12 }}>
        {receipt.lines.map((l) => (
          <div key={l.label} style={{ ...row, borderBottom: '1px solid #cfc6bd' }}>
            <div>{l.label}</div>
            <div style={{ fontFamily: 'News', fontSize: 18 }}>{fmtVnd(l.amount)}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, borderTop: '2px solid #2a2320', paddingTop: 10 }}>
        <div style={{ fontWeight: 700 }}>Tổng cộng</div>
        <div style={{ fontFamily: 'News', fontWeight: 700, fontSize: 32 }}>{fmtVnd(total)}</div>
      </div>
      <div style={{ marginTop: 8 }}>{`Bằng chữ: ${totalWords}`}</div>
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 28 }}>
        <img src={qr} width={150} height={150} />
        <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 20, flex: 1 }}>
          <div style={{ fontWeight: 700 }}>Quét mã VietQR để chuyển khoản</div>
          <div style={{ marginTop: 6 }}>{`Nội dung: ${receipt.memo}`}</div>
        </div>
      </div>
    </div>
  );
  const svg = await satori(tree, {
    width: W,
    height: H,
    fonts: [
      { name: 'BVP', data: fontBuf('BeVietnamPro-Regular.ttf'), weight: 400, style: 'normal' },
      { name: 'BVP', data: fontBuf('BeVietnamPro-Bold.ttf'), weight: 700, style: 'normal' },
      { name: 'News', data: fontBuf('Newsreader-Medium.ttf'), weight: 400, style: 'normal' },
      { name: 'News', data: fontBuf('Newsreader-Bold.ttf'), weight: 700, style: 'normal' },
    ],
  });
  return new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: false } }).render().asPng() as Buffer;
}
