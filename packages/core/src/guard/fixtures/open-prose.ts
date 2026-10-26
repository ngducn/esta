import type { FactSheet } from '../index';

/**
 * The open thread's advice and writing prompts (AGENT.md §5.6 step 7), each with a hand-written answer that cites every
 * name and amount by placeholder. `pnpm agent:guard-probe` sends the same prompts through `ask` live, and the replay set
 * keeps what the model wrote.
 */
export type OpenProsePrompt = {
  readonly id: string;
  readonly kind: 'advice' | 'writing' | 'explain' | 'world';
  readonly question: string;
  readonly template: string;
};

/** The records the templates cite, as the full seed's tools return them. */
export const OPEN_PROSE_SHEET: FactSheet = new Map([
  ['f1', { property_label: 'Dãy trọ Dĩ An' }],
  ['f2', { unit_label: 'Phòng 5', tenant_name: 'Hoàng Văn Em Demo', amount_display: '2.800.000 ₫', due_date_display: '25/09/2026', days_overdue_display: '12' }],
  ['f3', { property_label: 'Đất Bảo Lộc', mortgage_bank_name: 'Ngân hàng Demo', mortgage_amount_display: '2.000.000.000 ₫' }],
  ['f4', { unit_label: 'Phòng 2', tenant_name: 'Trần Thị Bình Demo', rent_display: '3.500.000 ₫' }],
]);

export const OPEN_PROSE: readonly OpenProsePrompt[] = [
  {
    id: 'vi-rent-by-year',
    kind: 'advice',
    question: 'Mẹ nên cho thuê theo năm hay theo tháng thì lợi hơn?',
    template:
      'Cho thuê theo năm giúp nguồn thu ổn định và đỡ phải tìm khách mới mỗi năm, nhưng khó điều chỉnh giá giữa chừng. Cho thuê theo tháng linh hoạt hơn, đổi lại dễ trống phòng.\n\nVới khách đã ở lâu và trả đúng hạn, hợp đồng theo năm có điều khoản điều chỉnh giá khi gia hạn thường an toàn hơn.',
  },
  {
    id: 'vi-choose-tenant',
    kind: 'advice',
    question: 'Có hai người muốn thuê phòng 2, một sinh viên và một cặp vợ chồng đi làm. Nên chọn ai?',
    template:
      'Mỗi người đều có thể là khách tốt. Cặp vợ chồng đi làm thường có thu nhập đều và ở lâu hơn, còn sinh viên hay chuyển đi khi hết năm học.\n\nBạn nên hỏi nơi làm việc hoặc người bảo lãnh, xem giấy tờ tùy thân, và nhận tiền cọc trước khi ký hợp đồng cho {{f4.unit_label}}.',
  },
  {
    id: 'vi-zalo-reminder',
    kind: 'writing',
    question: 'Nhắn Zalo giúp mẹ nhắc khách phòng 5 ở Dĩ An trả tiền phòng.',
    template:
      'Chào {{f2.tenant_name}}, tiền thuê {{f2.unit_label}} ở {{f1.property_label}} đến hạn ngày {{f2.due_date_display}} hiện còn {{f2.amount_display}}. Nhờ anh chị sắp xếp đóng giúp sớm. Nếu đã chuyển khoản rồi, anh chị báo lại để mình kiểm tra nhé. Cảm ơn anh chị.',
  },
  {
    id: 'vi-zalo-welcome',
    kind: 'writing',
    question: 'Viết tin nhắn chào mừng khách mới dọn vào phòng 2.',
    template:
      'Chào {{f4.tenant_name}}, chào mừng anh chị đến ở {{f4.unit_label}} tại {{f1.property_label}}. Nếu cần sửa gì trong phòng hoặc có thắc mắc về hóa đơn, anh chị cứ nhắn cho mình. Chúc anh chị ở vui vẻ.',
  },
  {
    id: 'vi-zalo-price-change',
    kind: 'writing',
    question: 'Soạn giúp tin nhắn báo khách sẽ điều chỉnh giá thuê khi gia hạn hợp đồng.',
    template:
      'Chào {{f4.tenant_name}}, hợp đồng thuê {{f4.unit_label}} sắp đến lúc gia hạn. Khi gia hạn, gia đình sẽ điều chỉnh giá thuê cho phù hợp với giá chung trong khu vực. Mình sẽ gửi mức giá cụ thể trước để anh chị cân nhắc. Cảm ơn anh chị đã ở lâu với gia đình.',
  },
  {
    id: 'vi-bank-letter',
    kind: 'writing',
    question: 'Viết thư gửi ngân hàng hỏi thủ tục xóa thế chấp sổ đất Bảo Lộc.',
    template:
      'Kính gửi {{f3.mortgage_bank_name}},\n\nGia đình tôi đang có khoản vay thế chấp bằng sổ của {{f3.property_label}}, số tiền vay {{f3.mortgage_amount_display}}. Tôi muốn hỏi thủ tục và giấy tờ cần chuẩn bị để xóa thế chấp khi tất toán khoản vay.\n\nRất mong ngân hàng hướng dẫn. Xin cảm ơn.',
  },
  {
    id: 'vi-invest',
    kind: 'advice',
    question: 'Có nên bán đất Bảo Lộc để đầu tư vào căn hộ cho thuê không?',
    template:
      'Đây là quyết định lớn, nên cân nhắc chín chắn. Đất thường giữ giá lâu dài nhưng không tạo dòng tiền, còn căn hộ cho thuê có thu nhập đều nhưng tốn chi phí quản lý và sửa chữa.\n\nTrước khi đầu tư, bạn nên nhờ một người môi giới uy tín định giá {{f3.property_label}} và xin tư vấn của ngân hàng đang giữ sổ.',
  },
  {
    id: 'vi-transfer-procedure',
    kind: 'explain',
    question: 'Thủ tục sang tên sổ đỏ gồm những bước nào?',
    template:
      'Thủ tục thường gồm các bước sau:\n\n1. Bên mua và bên bán công chứng hợp đồng chuyển nhượng tại văn phòng công chứng.\n2. Nộp hồ sơ khai thuế và lệ phí trước bạ.\n3. Nộp hồ sơ đăng ký biến động tại văn phòng đăng ký đất đai.\n4. Nhận sổ đã cập nhật tên người mới.\n\nGiấy tờ cụ thể có thể khác theo địa phương, nên hỏi văn phòng công chứng trước khi đi.',
  },
  {
    id: 'vi-notarize-lease',
    kind: 'explain',
    question: 'Hợp đồng thuê nhà có cần công chứng không?',
    template:
      'Hợp đồng thuê nhà ở không bắt buộc công chứng trong nhiều trường hợp, nhưng công chứng giúp hợp đồng chắc chắn hơn khi có tranh chấp. Nếu khách là doanh nghiệp hoặc thuê dài hạn, bạn nên công chứng để yên tâm.',
  },
  {
    id: 'vi-late-tenant',
    kind: 'advice',
    question: 'Khách phòng 5 hay trả trễ, mẹ nên làm gì?',
    template:
      '{{f2.tenant_name}} ở {{f2.unit_label}} hiện quá hạn {{f2.days_overdue_display}} ngày. Bạn nên nhắc nhẹ nhàng trước, hỏi xem khách có khó khăn gì, rồi thống nhất ngày trả cụ thể.\n\nNếu khách vẫn trễ nhiều lần, hãy cân nhắc chín chắn trước khi gia hạn hợp đồng, và ghi rõ điều khoản phạt trễ hạn trong hợp đồng mới.',
  },
  {
    id: 'vi-deposit',
    kind: 'explain',
    question: 'Tiền cọc nên giữ thế nào cho đúng?',
    template:
      'Tiền cọc là tiền của khách gửi để bảo đảm hợp đồng, nên giữ riêng và ghi rõ trong hợp đồng khi nào hoàn lại và khi nào được trừ. Khi khách trả phòng, bạn kiểm tra phòng cùng khách, trừ các khoản hư hỏng có biên bản, rồi hoàn phần còn lại.',
  },
  {
    id: 'vi-repair-first',
    kind: 'advice',
    question: 'Có nên sửa phòng trước khi cho khách mới thuê không?',
    template:
      'Nên sửa những hư hỏng ảnh hưởng đến an toàn và sinh hoạt như điện, nước và khóa cửa trước khi khách dọn vào. Phòng sạch sẽ, gọn gàng cũng dễ cho thuê hơn và giữ được giá. Những việc trang trí thêm có thể làm dần.',
  },
  {
    id: 'vi-end-lease-letter',
    kind: 'writing',
    question: 'Soạn thông báo chấm dứt hợp đồng thuê cho khách phòng 2.',
    template:
      'Chào {{f4.tenant_name}},\n\nGia đình xin thông báo sẽ không gia hạn hợp đồng thuê {{f4.unit_label}} tại {{f1.property_label}} khi hợp đồng hết hạn. Mình sẽ cùng anh chị kiểm tra phòng và hoàn tiền cọc theo hợp đồng. Cảm ơn anh chị trong thời gian qua.',
  },
  {
    id: 'vi-insurance',
    kind: 'advice',
    question: 'Có nên mua bảo hiểm cháy nổ cho dãy trọ không?',
    template:
      'Nên mua. Dãy trọ có nhiều người ở và dùng điện, bếp nấu, nên rủi ro cháy cao hơn nhà riêng. Bảo hiểm giúp gia đình đỡ thiệt hại lớn khi có sự cố. Bạn nên hỏi vài công ty bảo hiểm để so sánh quyền lợi trước khi chọn.',
  },
  {
    id: 'vi-rent-tax',
    kind: 'explain',
    question: 'Cho thuê nhà thì khai thuế như thế nào?',
    template:
      'Người cho thuê nhà là cá nhân thường khai thuế với chi cục thuế nơi có nhà, theo năm hoặc theo kỳ thanh toán của hợp đồng. Hồ sơ gồm tờ khai và bản sao hợp đồng thuê. Nếu doanh thu dưới ngưỡng chịu thuế thì không phải nộp, nhưng vẫn nên khai để có hồ sơ. Bạn có thể xem thẻ thuế trong mục Báo cáo.',
  },
  {
    id: 'vi-inheritance',
    kind: 'advice',
    question: 'Ba mẹ muốn để lại nhà cho các con thì nên làm gì?',
    template:
      'Bố mẹ có thể lập di chúc có công chứng, hoặc làm hợp đồng tặng cho khi còn sống. Di chúc giữ quyền quyết định đến cuối cùng, còn tặng cho thì sang tên ngay. Gia đình nên bàn kỹ với nhau và hỏi tư vấn của văn phòng công chứng để chọn cách phù hợp.',
  },
  {
    id: 'vi-zalo-thanks',
    kind: 'writing',
    question: 'Viết tin nhắn cảm ơn khách đã đóng tiền đúng hạn.',
    template:
      'Chào {{f4.tenant_name}}, gia đình đã nhận tiền thuê {{f4.unit_label}}. Cảm ơn anh chị đã luôn đóng tiền đúng hạn. Nếu phòng cần sửa gì, anh chị cứ báo cho mình nhé.',
  },
  {
    id: 'vi-raise-rent',
    kind: 'advice',
    question: 'Năm sau có nên tăng giá phòng không?',
    template:
      'Nên xem giá các phòng tương tự gần {{f1.property_label}} trước. Nếu giá chung đã tăng và khách vẫn ở ổn định, tăng nhẹ khi gia hạn là hợp lý. Nếu phòng đang khó cho thuê, giữ giá để giữ khách tốt thường có lợi hơn.',
  },
  {
    id: 'vi-red-pink-book',
    kind: 'explain',
    question: 'Sổ đỏ với sổ hồng khác nhau thế nào?',
    template:
      'Trước đây sổ đỏ thường cấp cho đất, còn sổ hồng cấp cho nhà ở và đất ở. Hiện nay sổ đỏ và sổ hồng đã gộp thành một mẫu giấy chứng nhận chung, nên giá trị pháp lý như nhau. Điều quan trọng là thông tin trên sổ đúng và đầy đủ.',
  },
  {
    id: 'vi-property-manager',
    kind: 'advice',
    question: 'Có nên thuê công ty quản lý cho dãy trọ không?',
    template:
      'Công ty quản lý giúp bạn đỡ việc thu tiền, tìm khách và sửa chữa, đổi lại mất một khoản phí. Nếu gia đình ở xa {{f1.property_label}} hoặc không có thời gian, đây là lựa chọn đáng cân nhắc. Hãy chọn nơi có hợp đồng rõ ràng và báo cáo thu chi đều đặn.',
  },
  {
    id: 'vi-electrician',
    kind: 'writing',
    question: 'Nhắn giúp thợ điện đến sửa ổ cắm ở phòng 2.',
    template:
      'Chào anh, nhờ anh ghé {{f1.property_label}} sửa ổ cắm ở {{f4.unit_label}} giúp gia đình. Khách đang ở là {{f4.tenant_name}}, anh liên hệ trước để hẹn giờ nhé. Cảm ơn anh.',
  },
  {
    id: 'vi-savings-rate',
    kind: 'world',
    question: 'Lãi suất gửi tiết kiệm bây giờ khoảng bao nhiêu?',
    template:
      'Ứng dụng chưa có lãi suất tiết kiệm hiện nay, và Trợ lý chưa tra cứu được trên mạng, nên không ước tính con số nào. Bạn có thể xem bảng lãi suất trên trang của ngân hàng hoặc hỏi trực tiếp tại quầy.',
  },
  {
    id: 'en-rent-by-year',
    kind: 'advice',
    question: 'Should I rent by the year instead of by the month?',
    template:
      'Renting by the year gives steadier income and fewer tenant changes, but the rent is harder to adjust. Renting by the month is more flexible, with more empty rooms between tenants. For a reliable tenant, a yearly lease with a rent review at renewal is usually the safer choice.',
  },
  {
    id: 'en-reminder',
    kind: 'writing',
    question: 'Write a short message reminding the tenant in Room 5 to pay.',
    template:
      'Hello {{f2.tenant_name}}, the rent for {{f2.unit_label}} at {{f1.property_label}} was due on {{f2.due_date_display}}, and {{f2.amount_display}} is still open. Please let me know when you can pay. Thank you.',
  },
  {
    id: 'en-second-opinion',
    kind: 'advice',
    question: 'Can you give me a second opinion on selling the Bảo Lộc land?',
    template:
      'Here is a second opinion. Land usually holds its value but brings no income, while selling frees money you could rent out. Before you decide, ask a trusted agent to value {{f3.property_label}} and talk to {{f3.mortgage_bank_name}}, which holds its certificate.',
  },
  {
    id: 'en-double-check-deposit',
    kind: 'explain',
    question: "How do I double-check that a buyer's deposit is safe?",
    template:
      'To double-check a deposit, sign a written deposit agreement at a notary office, receive the money by bank transfer rather than cash, and keep the receipts with the agreement. The agreement should say what happens if either side backs out.',
  },
  {
    id: 'en-notarized-lease',
    kind: 'explain',
    question: 'What is a notarized lease?',
    template:
      'A notarized lease is a lease signed in front of a notary, who checks both parties and the papers. It is not always required for renting a home, but it makes the lease stronger if there is a dispute.',
  },
];
