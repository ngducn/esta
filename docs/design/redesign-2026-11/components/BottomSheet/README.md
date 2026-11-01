# Bottom sheet

A bottom sheet is the phone's way to do a quick task, such as recording a payment, without leaving the list. Markup: `<section class="es-sheet" role="dialog" aria-modal="true" aria-labelledby="t"><span class="es-sheet__grabber"></span><div class="es-sheet__head"><h2 class="es-sheet__title" id="t">Ghi nhận tiền</h2><button class="es-btn es-btn--ghost es-btn--sm">Đóng</button></div><div class="es-sheet__body">…</div><div class="es-sheet__foot">…</div></section>` over an `es-scrim`.

**Anatomy.** Grabber (the sheet can be dragged down to close); head with the title and `Đóng` as a word, never a bare ×; body with `field-gap` between fields; a foot that stays put with one `es-btn--primary es-btn--lg es-btn--block` and padding for `env(safe-area-inset-bottom)` (`--sheet-safe`). `es-sheet__context` names what the task is about (`Phòng 5 · Trần Demo An`). `es-sheet__row` is a read-out with an `Đổi` action, for values that are usually right (the date: `Hôm nay, 07/10/2026`).

**Record payment.** The amount is an `es-field es-money es-money--lg` (figure-lg, prefilled with the rent) with `= 3.500.000 ₫` and the amount in words beneath; the method is an `es-segmented` (`Tiền mặt` · `Chuyển khoản`).

**States.** Keyboard up: add `--compact` and set `bottom` to the keyboard height; grabber, context and `es-sheet__more` hide so the amount and the save button stay in view. Saving: fields read-only, `Đóng` disabled, the button shows `Đang lưu` with a spinner and keeps its width. Couldn't save: nothing typed is lost, `es-sheet__error` with `role="alert"` sits above the button, which becomes `Thử lại`.

**Motion.** Slides up over `duration-sheet` with `ease-enter`; under reduced motion it fades in place. Max height is 92% of the screen; the body scrolls.

The consumer provides: the title, the fields, the one primary action, and the keyboard inset when it changes.

- Do: keep one primary in the foot and nothing below it.
- Don't: put a second sheet on top, or use a sheet on desktop (use a modal).
