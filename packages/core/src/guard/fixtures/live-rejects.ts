/**
 * What the guard rejected in the Phase 5 live run's open-prose probe (P5-10b, `docs/plan/trail/phase-5-guard.md`): the
 * sentence the model wrote, whether the figure it names is a true reject (a count or a number the model typed itself)
 * or a false one (a number word that states no figure), and the text the guard reads as the number. Sentences are cut
 * from the live answers on the synthetic `full` seed.
 */
export type LiveReject = {
  readonly id: string;
  readonly pass: 'first' | 'repair';
  /** `steered`: a number word that states no figure, which the guard rejects and the prompt steers the model away from. */
  readonly kind: 'true' | 'false' | 'steered';
  readonly sentence: string;
  /** The word or token the guard named, or that it must now stop naming. */
  readonly text: string;
};

export const LIVE_REJECTS: readonly LiveReject[] = [
  { id: 'en-notarized-lease', pass: 'first', kind: 'true', sentence: 'The notary confirms three things:', text: 'three' },
  { id: 'vi-choose-tenant', pass: 'first', kind: 'true', sentence: 'Tôi cũng không có hồ sơ của hai người đang hỏi thuê, nên chỉ nêu được những điểm nên cân nhắc.', text: 'hai' },
  { id: 'vi-end-lease-letter', pass: 'first', kind: 'true', sentence: 'Tôi chưa có ngày chấm dứt và lý do nên để trống hai chỗ đó.', text: 'hai' },
  { id: 'vi-inheritance', pass: 'first', kind: 'true', sentence: 'Có hai cách chính để để lại nhà cho các con.', text: 'hai' },
  { id: 'vi-inheritance', pass: 'first', kind: 'steered', sentence: '- **Lập di chúc:** Ba mẹ vẫn giữ quyền sử dụng và quyền sở hữu đến khi qua đời.', text: 'Ba' },
  { id: 'vi-inheritance', pass: 'first', kind: 'steered', sentence: 'Nhưng ba mẹ không còn toàn quyền với tài sản đó, và khó đổi ý hơn.', text: 'ba' },
  { id: 'vi-inheritance', pass: 'first', kind: 'steered', sentence: 'Tài sản nào đứng tên riêng của ba hoặc mẹ, tài sản nào là chung của cả hai.', text: 'ba' },
  { id: 'vi-inheritance', pass: 'first', kind: 'steered', sentence: 'Tài sản nào đứng tên riêng của ba hoặc mẹ, tài sản nào là chung của cả hai.', text: 'hai' },
  { id: 'vi-late-tenant', pass: 'first', kind: 'true', sentence: 'Khách phòng 5 là {{f17.tenant_name}}, thuê {{f17.property_label}}.', text: '5' },
  { id: 'vi-notarize-lease', pass: 'first', kind: 'steered', sentence: 'Nếu bạn muốn có thêm bảo đảm khi có tranh chấp, cả hai bên có thể cùng đi công chứng.', text: 'hai' },
  { id: 'vi-property-manager', pass: 'first', kind: 'false', sentence: '- Cách tính phí: theo phần trăm tiền thu được hay một khoản cố định.', text: 'trăm' },
  { id: 'vi-raise-rent', pass: 'first', kind: 'true', sentence: '- **[Nhà phố Q7](f6):** hợp đồng của {{f15.tenant_name}} sắp đến hạn.', text: 'Q7' },
  { id: 'vi-red-pink-book', pass: 'first', kind: 'true', sentence: '**Sổ đỏ** và **sổ hồng** là hai tên gọi dân gian của hai loại giấy chứng nhận trước đây:', text: 'hai' },
  { id: 'vi-rent-tax', pass: 'first', kind: 'true', sentence: 'Hiện cả hai chủ sở hữu chưa vượt ngưỡng.', text: 'hai' },
  { id: 'vi-zalo-reminder', pass: 'first', kind: 'true', sentence: 'Dưới đây là tin nhắn Zalo để mẹ gửi khách phòng 5:', text: '5' },
  { id: 'vi-zalo-welcome', pass: 'first', kind: 'true', sentence: 'Phòng 2 thuộc Dãy trọ Dĩ An.', text: '2' },
  { id: 'vi-bank-letter', pass: 'repair', kind: 'true', sentence: 'Tôi đã đọc hai trang chính thức nhưng không trích dẫn được trang nào qua công cụ.', text: 'hai' },
];
