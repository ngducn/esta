import React from 'react';
import { Document, Page, Text, View, Image, Font, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { font, receipt, total, totalWords, fmtVnd, qrDataUrl, A5_PT } from './data.ts';

Font.register({
  family: 'BVP',
  fonts: [
    { src: font('BeVietnamPro-Regular.ttf'), fontWeight: 400 },
    { src: font('BeVietnamPro-Bold.ttf'), fontWeight: 700 },
  ],
});
Font.register({
  family: 'News',
  fonts: [
    { src: font('Newsreader-Medium.ttf'), fontWeight: 400 },
    { src: font('Newsreader-Bold.ttf'), fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback((w) => [w]);

const s = StyleSheet.create({
  page: { padding: 28, fontFamily: 'BVP', fontSize: 10, color: '#2a2320' },
  head: { flexDirection: 'row', justifyContent: 'space-between', borderBottom: '1 solid #2a2320', paddingBottom: 8 },
  household: { fontFamily: 'News', fontWeight: 700, fontSize: 16 },
  title: { fontFamily: 'News', fontWeight: 700, fontSize: 22, marginTop: 14, marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  label: { color: '#6b5f58' },
  fig: { fontFamily: 'News', fontSize: 13 },
  line: { borderBottom: '0.5 solid #cfc6bd' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, borderTop: '1 solid #2a2320', paddingTop: 8 },
  totalFig: { fontFamily: 'News', fontWeight: 700, fontSize: 22 },
  words: { marginTop: 6 },
  qrWrap: { marginTop: 18, flexDirection: 'row', alignItems: 'center' },
  qr: { width: 110, height: 110 },
});

export async function renderReactPdf(): Promise<Buffer> {
  const qr = await qrDataUrl();
  const doc = (
    <Document title={receipt.title} language="vi">
      <Page size={[A5_PT.w, A5_PT.h]} style={s.page}>
        <View style={s.head}>
          <Text style={s.household}>{receipt.household}</Text>
          <Text style={s.label}>Số {receipt.no}</Text>
        </View>
        <Text style={s.title}>{receipt.title}</Text>
        <View style={s.row}><Text style={s.label}>Người thuê</Text><Text>{receipt.tenant}</Text></View>
        <View style={s.row}><Text style={s.label}>Căn thuê</Text><Text>{receipt.unit}</Text></View>
        <View style={s.row}><Text style={s.label}>Kỳ</Text><Text>{receipt.periodFrom} đến {receipt.periodTo}</Text></View>
        <View style={{ marginTop: 8 }}>
          {receipt.lines.map((l) => (
            <View key={l.label} style={[s.row, s.line]}><Text>{l.label}</Text><Text style={s.fig}>{fmtVnd(l.amount)}</Text></View>
          ))}
        </View>
        <View style={s.totalRow}><Text style={{ fontWeight: 700 }}>Tổng cộng</Text><Text style={s.totalFig}>{fmtVnd(total)}</Text></View>
        <Text style={s.words}>Bằng chữ: {totalWords}</Text>
        <View style={s.qrWrap}>
          <Image src={qr} style={s.qr} />
          <View style={{ marginLeft: 14, flex: 1 }}>
            <Text style={{ fontWeight: 700 }}>Quét mã VietQR để chuyển khoản</Text>
            <Text style={{ marginTop: 4 }}>Nội dung: {receipt.memo}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
