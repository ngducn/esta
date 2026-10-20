import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import writeXlsxFile from 'write-excel-file/node';
import { A4, page, pdf } from '../../supabase/seed/documents/render.ts';

/**
 * Writes the Demo move-in folder (CONNECTOR.md §7): a tracker workbook, two certificate photos and one lease contract,
 * all synthetic. Run with `pnpm fixtures:connector-demo`. The photos are the P2-01 low-light fixtures the seed does
 * not use, so loading them into a seeded household raises no duplicate.
 */
const here = import.meta.dirname;
const folder = join(here, 'Demo');
mkdirSync(folder, { recursive: true });

const certificates = join(here, '..', 'certificates');
copyFileSync(join(certificates, 'so_hong_pre2009-low-light', 'page-1.jpg'), join(folder, 'so-hong-demo-le-van-sy.jpg'));
copyFileSync(join(certificates, 'so_do_pre2009-low-light', 'page-1.jpg'), join(folder, 'so-do-demo-cu-chi.jpg'));

const contract = [1, 2].map((n) =>
  page(
    ...A4,
    n === 1
      ? [
          { text: 'HỢP ĐỒNG THUÊ NHÀ (DEMO)', size: 40, bold: true },
          { text: 'Nhà phố Demo Lê Văn Sỹ, 12/45 Lê Văn Sỹ, Quận 3', size: 30 },
          { text: 'Bên cho thuê: Phạm Minh Demo và Nguyễn Thị Demo Lan', size: 30 },
          { text: 'Bên thuê: Lê Văn Demo Khách', size: 30 },
          { text: 'Giá thuê: 15.000.000 đồng/tháng, cọc 2 tháng', size: 30 },
          { text: 'Thời hạn: từ 01/03/2026 đến 28/02/2027', size: 30 },
          { text: 'Trang 1 / 2', size: 26 },
        ]
      : [
          { text: 'ĐIỀU KHOẢN CHUNG (DEMO)', size: 40, bold: true },
          { text: 'Tiền thuê trả trước ngày 5 hằng tháng.', size: 30 },
          { text: 'Trang 2 / 2', size: 26 },
          { text: 'Tài liệu tổng hợp để thử nghiệm, không có giá trị pháp lý.', size: 24 },
        ],
    '#2f5d8a',
  ),
);
writeFileSync(join(folder, 'hop-dong-thue-demo-le-van-sy.pdf'), await pdf(contract));

/** As a family keeps it by hand: one amount typed as text and one stored as a number, one date cell and one typed date. */
const tracker = [
  ['Mã', 'Tên gọi', 'Loại', 'Mục đích', 'Địa chỉ', 'Địa chỉ trên sổ', 'Pháp lý', 'Ngày mua', 'Hình thức', 'Giá mua', 'Ghi chú', 'Giấy tờ'],
  [
    'DEMOQ3',
    'Nhà phố Demo Lê Văn Sỹ',
    'Nhà phố',
    'Cho thuê',
    '12/45 Lê Văn Sỹ, Phường 13, Quận 3, TP.HCM',
    '12/45 đường Lê Văn Sỹ, phường 13, quận 3, TP. Hồ Chí Minh',
    'Sổ hồng',
    { value: new Date(Date.UTC(2008, 5, 20)), type: Date, format: 'dd/mm/yyyy' },
    'Mua',
    '4,85 tỷ',
    'Demo: cho thuê nguyên căn',
    'so-hong-demo-le-van-sy.jpg, hop-dong-thue-demo-le-van-sy.pdf',
  ],
  [
    'DEMOCC',
    'Đất vườn Demo Củ Chi',
    'Đất nông nghiệp',
    'Để đó',
    'Ấp Tân Phú, xã Tân Thông Hội, huyện Củ Chi, TP.HCM',
    'ấp Tân Phú, xã Tân Thông Hội, huyện Củ Chi, TP. Hồ Chí Minh',
    'Sổ đỏ',
    '15/08/2005',
    'Thừa kế',
    1_250_000_000,
    null,
    'so-do-demo-cu-chi.jpg',
  ],
];
await writeXlsxFile([{ sheet: 'Tài sản', data: tracker }], {}).toFile(join(folder, 'theo-doi-tai-san-demo.xlsx'));
console.log('Wrote the Demo move-in folder to', folder);
