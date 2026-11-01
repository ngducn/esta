# Modal

A modal is a desktop dialog for a short task that must finish before the page makes sense again. Markup: `<div class="es-scrim"><div class="es-modal" role="dialog" aria-modal="true" aria-labelledby="t"><div class="es-modal__head"><h2 class="es-modal__title" id="t">…</h2><button class="es-btn es-btn--ghost es-btn--icon es-btn--sm" aria-label="Đóng">…</button></div><div class="es-modal__body">…</div><div class="es-modal__foot">…</div></div></div>`.

**Sizes.** Default 480 (`width-form` × 0.75) for forms and confirmations; `--wide` 640 (`width-form`) for reading. Both shrink to the viewport minus 24px.

**Foot.** Right-aligned, secondary first and primary last (`Huỷ` · `Lưu tên`). A destructive confirm uses `role="alertdialog"`, a `triangle-alert` beside a title that names the object, `Giữ lại` · `es-btn--danger`, and starts focus on `Giữ lại`.

**Long content.** Add `--scroll`: the body scrolls (and is focusable with `tabindex="0"`), head and foot stay, the foot keeps its top hairline.

**Behaviour.** Focus moves into the dialog (first field, or the safe button for a confirm) and is trapped there; Escape and the close button cancel; focus returns to the opener. The scrim is `scrim`; clicking it cancels only when nothing has been typed. It arrives with a 2% scale and fade (`duration-slow`, `ease-enter`); under reduced motion it only fades.

**Phones.** Never a modal: the same content opens as a bottom sheet (`es-sheet`) with words instead of the ×.

The consumer provides: the title, body content, foot buttons, initial focus target and the cancel handler.

- Do: name the object in the title (`Kết thúc hợp đồng Phòng 3 từ 31/10/2026?`).
- Don't: stack a modal on a modal, or use one for a message that a toast or inline text can carry.
