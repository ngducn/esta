# Inline confirmation

An inline confirmation replaces a row's action area with a question that names the object, so a destructive step is confirmed where it started. Markup: `<div class="es-confirm" role="group" aria-labelledby="q"><p class="es-confirm__q" id="q">Kết thúc hợp đồng Phòng 3 từ 31/10/2026?<span class="es-confirm__note">…</span></p><div class="es-confirm__actions"><button class="es-btn es-btn--secondary">Giữ lại</button><button class="es-btn es-btn--danger">Kết thúc hợp đồng</button></div></div>`.

**Use it** for destructive actions on one item in a list or detail section: ending a lease, removing a photo, deleting a draft. Open it from an `es-btn--danger-quiet` button. A modal is for destructive actions that need more than two sentences of consequence, on desktop only.

**Behaviour.** The question takes the full row width (`flex-basis: 100%` when the row wraps). Focus moves to `Giữ lại`; Escape is the same as `Giữ lại` and returns focus to the button that opened it. `--phone` makes the buttons share the row, 44px tall, safe choice first.

**States.** Loading: the danger button shows a spinner and its -ing label (`Đang kết thúc`), `Giữ lại` is disabled, the group is `aria-busy`. Couldn't finish: the question stays, `es-confirm__msg` with `role="alert"` explains (`Chưa kết thúc được. Kiểm tra mạng rồi thử lại.`) and the danger button becomes `Thử lại`.

**Content.** The question names the thing and the date; the note says what is kept (`Tiền cọc vẫn được giữ cho đến khi trả lại.`). The confirming button repeats the verb and object, never `Xác nhận` or `Có`.

The consumer provides: the question, an optional note, the two handlers and the pending state.

- Do: keep the row's identifying text visible above the question.
- Don't: ask `Bạn có chắc không?`, or colour the whole row red.
