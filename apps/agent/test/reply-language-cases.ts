/**
 * The labels of the seeded household that the questions below name, as `householdLabels` reads them: property
 * nicknames, unit labels, party names, and the place names of the property addresses, each by its full name and as
 * people say it (`Phường Thủ Đức`, `Thủ Đức`).
 */
export const SEED_LABELS = [
  'Căn hộ Thủ Đức',
  'Dãy trọ Dĩ An',
  'Đất Bảo Lộc',
  'Đất vườn Long An',
  'Kho Biên Hòa',
  'Mặt bằng Quận 1',
  'Phòng 2',
  'Phòng 3',
  'Phòng 4',
  'Phòng 5',
  'Phòng 8',
  'Hoàng Văn Em Demo',
  'Nguyễn Văn An Demo',
  'Trần Thị Bình Demo',
  'Phường Thủ Đức',
  'Thủ Đức',
  'Phường Dĩ An',
  'Dĩ An',
  'Phường 1 Bảo Lộc',
  'Bảo Lộc',
] as const;

/** English questions that name seeded records. Their Vietnamese words are the records' names, and every one is answered in English. */
export const ENGLISH_NAMING_RECORDS = [
  'Should I renew the lease on Căn hộ Thủ Đức?',
  'How much did Căn hộ Thủ Đức earn this year?',
  'Is the tenant in Phòng 5 Dãy trọ Dĩ An paying on time?',
  'Which rooms in Thủ Đức are overdue?',
  'When does the lease on Phòng 3 of Dãy trọ Dĩ An end?',
  'Is Kho Biên Hòa vacant right now?',
  'Has Nguyễn Văn An Demo paid the rent for Phòng 2 this month?',
  'What taxes do I owe on Đất vườn Long An this year?',
  'Write a reminder for Trần Thị Bình Demo about the rent for Phòng 4.',
  'Should I sell the land in Bảo Lộc?',
  'What is the deposit on Phòng 8 in Dĩ An?',
  'How much rent does Mặt bằng Quận 1 bring in each month?',
] as const;

/** Vietnamese questions that name the same records, with Vietnamese words of their own, and every one is answered in Vietnamese. */
export const VIETNAMESE_NAMING_RECORDS = [
  'Có nên gia hạn hợp đồng Căn hộ Thủ Đức không?',
  'Căn hộ Thủ Đức năm nay thu được bao nhiêu?',
  'Phòng 5 Dãy trọ Dĩ An có đóng tiền đúng hạn không?',
  'Phòng nào ở Thủ Đức đang trễ hạn?',
  'Nhắc Nguyễn Văn An Demo đóng tiền Phòng 2 tháng này',
  'Kho Biên Hòa còn trống không con?',
  'Check giúp mẹ Phòng 3 Dãy trọ Dĩ An đã paid chưa',
  'Có nên bán Đất Bảo Lộc không?',
  'Hoàng Văn Em Demo có trễ tiền Phòng 4 không?',
  'phong 5 day tro Di An dong tien chua',
] as const;
