import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { A4, page, pdf } from './render';

/** Writes the synthetic seed documents that are not certificates. Run with `pnpm exec tsx supabase/seed/documents/generate.ts`. */
const here = import.meta.dirname;
const insurance = [
  page(...A4, [
    { text: 'GIẤY CHỨNG NHẬN BẢO HIỂM CHÁY NỔ (DEMO)', size: 40, bold: true },
    { text: 'Tài sản: Nhà phố Q7, đường số 15 Demo, Quận 7', size: 30 },
    { text: 'Người được bảo hiểm: Nguyễn Thị Demo', size: 30 },
    { text: 'Thời hạn: từ 31/10/2025 đến 30/10/2026', size: 30 },
    { text: 'Số tiền bảo hiểm: 1.500.000.000 đồng', size: 30 },
    { text: 'Tài liệu tổng hợp để thử nghiệm, không có giá trị pháp lý.', size: 24 },
  ], '#b83a26'),
];
const lease = [1, 2].map((n) =>
  page(...A4, [
    { text: n === 1 ? 'HỢP ĐỒNG THUÊ CĂN HỘ (DEMO)' : 'ĐIỀU KHOẢN CHUNG (DEMO)', size: 40, bold: true },
    { text: 'Căn hộ Thủ Đức, Thành phố Thủ Đức', size: 30 },
    { text: 'Bên cho thuê: Nguyễn Thị Demo và Trần Minh Demo', size: 30 },
    { text: `Trang ${n} / 2`, size: 26 },
    { text: 'Tài liệu tổng hợp để thử nghiệm, không có giá trị pháp lý.', size: 24 },
  ], '#2f5d8a'),
);
const idCard = page(1012, 638, [
  { text: 'CĂN CƯỚC CÔNG DÂN (DEMO)', size: 40, bold: true },
  { text: 'Họ và tên: NGUYỄN THỊ DEMO', size: 30 },
  { text: 'Số: ••••••••3456', size: 30 },
  { text: 'Thẻ tổng hợp để thử nghiệm.', size: 24 },
], '#3f7d4e');

writeFileSync(join(here, 'bao-hiem-q7.pdf'), await pdf(insurance));
writeFileSync(join(here, 'bao-hiem-q7.page-1.png'), insurance[0] ?? Buffer.alloc(0));
writeFileSync(join(here, 'hop-dong-thue-thu-duc.pdf'), await pdf(lease));
writeFileSync(join(here, 'hop-dong-thue-thu-duc.page-1.png'), lease[0] ?? Buffer.alloc(0));
writeFileSync(join(here, 'cccd-demo.png'), idCard);
console.log('Wrote the seed documents to', here);
