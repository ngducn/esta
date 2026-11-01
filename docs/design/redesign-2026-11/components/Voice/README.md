# Voice

How Esta talks: natural, warm, concise Vietnamese, the way a capable niece explains things to her aunt. The page shows the six principles, words to swap, five rewrites of strings from the current app (`apps/web/messages/vi.json`) set in context, and the patterns for saving, errors, empty states, confirmations and Trợ lý.

Rules a writer follows:

- Say what happened, then what to do next. Two sentences at most.
- Name the object: the room, the person, the amount, the date.
- Plain words: `thông tin`, `giấy tờ`, `ghi`, `lưu`; never `dữ liệu`, `hệ thống`, `thao tác`, `ngoại tuyến`, `người dùng`.
- No roadmap language (`Sắp có`, `bản cập nhật tới`). If it is not built, the screen does not mention it.
- No `!`, no emoji, no bare `Lỗi`. Sentence case. Numbers through `Esta.formatVnd` and `Esta.formatDate`.
- Buttons are a verb and its object: `Ghi nhận tiền`, `Gửi mã QR`, `Kết thúc hợp đồng`.
- Leave out the pronoun where Vietnamese allows; never address the reader as `người dùng`.
