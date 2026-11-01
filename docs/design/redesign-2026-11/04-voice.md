# Voice

Esta talks the way a capable niece explains things to her aunt: natural, warm, short, and always ending on what to do next. She knows the numbers cold and never makes her aunt feel slow.

## Principles

1. **Say what happened, then what to do.** `Chưa lưu được. Kiểm tra mạng rồi thử lại.` Not a code, not a cause only engineers understand.
2. **Name the thing.** `Kết thúc hợp đồng Phòng 3 từ 31/10/2026?` beats `Bạn có chắc không?`. Places, people and amounts are always specific.
3. **Plain words over system words.** `thông tin`, `giấy tờ`, `ghi`, `lưu` — not `dữ liệu`, `hệ thống`, `thao tác`, `bản ghi`, `ngoại tuyến`, `đồng bộ`. Legal terms only as printed on the sổ (`thửa đất`, `tờ bản đồ`).
4. **Today, not someday.** Describe what works now and offer that action. No `Sắp có`, no `bản cập nhật tới`, no `Tính năng đang phát triển`. If something is not built, the screen does not mention it.
5. **Calm about problems.** `Quá hạn 12 ngày` states a fact. No `!`, no `Lỗi`, no `Cảnh báo`, no red words standing alone.
6. **Leave out the pronoun when Vietnamese allows it.** `Kiểm tra lại số tiền.` reads warmer than `Bạn hãy kiểm tra lại số tiền.` When a subject is needed, the assistant is `Trợ lý` and the person is not addressed as `người dùng`.
7. **Short.** One idea per sentence; two sentences in a message; a button is a verb and its object (`Ghi nhận tiền`, `Gửi mã QR`).

Mechanics: sentence case everywhere (`Thu tiền tháng 10`, not `Thu Tiền Tháng 10`); no exclamation marks; no emoji; numbers always through the formatters; `Trợ lý` never `AI`, never a sparkle.

## Patterns

| Moment | Write |
| --- | --- |
| Saved, reversible | `Đã ghi nhận 3.500.000 ₫ từ Phòng 5.` + `Hoàn tác` |
| Couldn't save | `Chưa lưu được. Kiểm tra mạng rồi thử lại.` |
| Field error | `Chưa hiểu số này. Thử 3tr5, 850k hoặc 3.500.000.` |
| Empty, first time | `Chưa có tài sản nào.` / `Chụp ảnh sổ để Trợ lý điền sẵn, hoặc nhập tay.` + `Chụp ảnh sổ` |
| Empty, filtered | `Tháng 10 không có phòng nào quá hạn.` + `Xem tất cả` |
| Destructive confirm | `Kết thúc hợp đồng Phòng 3 từ 31/10/2026? Tiền cọc vẫn được giữ cho đến khi trả lại.` + `Kết thúc hợp đồng` / `Giữ lại` |
| Trợ lý note | `Tháng 10 thu chậm hơn tháng 9 khoảng 4 tr, chủ yếu do 2 phòng ở Dĩ An.` |
| Waiting on Trợ lý | `Trợ lý đang đọc ảnh sổ. Cứ làm tiếp, xong sẽ báo.` |

## Five rewrites from the current app

| Where | Now (`apps/web/messages/vi.json`) | Rewrite | Why |
| --- | --- | --- | --- |
| A section not built yet (`sections.soonTitle`) | Sắp có trong bản cập nhật tới | *(remove the section)* — or, where part of it works: **Tài khoản nhận tiền** / `Thêm tài khoản để hóa đơn có mã QR.` + `Thêm tài khoản` | Roadmap language promises what the screen cannot do; show what works today |
| Settings intro (`sections.settings`) | Tài khoản nhận tiền và cài đặt hiển thị. Gia đình và thành viên sẽ có ở đây trong bản cập nhật tới. | Tài khoản nhận tiền, cỡ chữ và giao diện. | Drop the promise; describe the page |
| Splitting a leased house (`propertyRental.errorWholeLeased`) | Không thể chia nhỏ tài sản khi đang cho thuê nguyên căn. | Nhà này đang cho thuê nguyên căn. Kết thúc hợp đồng hiện tại rồi chia thành từng phòng. | `Không thể` is a wall; say why and the way through |
| A failed assistant job (`assistant.jobStatus.failed`) | Lỗi | Chưa xong · `Thử lại` | A bare `Lỗi` alarms and explains nothing; pair the state with its action |
| Assistant offline (`assistant.statusOffline`) | Trợ lý ngoại tuyến từ {time}. Việc mới sẽ chạy khi máy hoạt động lại. | Trợ lý nghỉ từ {time}. Việc mới sẽ được làm khi Trợ lý chạy lại; mọi thứ khác vẫn dùng bình thường. | `ngoại tuyến` and `máy` are engineer words; reassure that the app still works |
