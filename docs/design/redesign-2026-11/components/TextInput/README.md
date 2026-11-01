# Text input

A single-line field with its label above, an example as placeholder, and a hint or an error in words below. Markup: `<div class="es-field"><label class="es-field__label" for="name">Tên gọi</label><input class="es-input" id="name" placeholder="Ví dụ: Dãy trọ Dĩ An"><p class="es-field__hint">…</p></div>`.

**Parts.** `es-field` stacks label, control and message with `space-1.5` between them. `es-field__optional` marks an optional field (`(không bắt buộc)`); required is the default and is not marked. For an icon or a unit inside the box, wrap the input in `es-input-group` and add `<i data-icon>` before it or `<span class="es-affix">m²</span>` after it.

**Size.** Height is `--control-h` (48 Thoáng, 40 Gọn, never under 44 on touch). Text is always 16px, so phones never zoom on focus.

**States.** Hover turns the edge `text-muted`. Focus-visible draws the 2px `focus-ring` 2px outside (on the group when there is one). Error: add `is-error` to `es-field`, `aria-invalid="true"` and `aria-describedby` on the input, and an `es-field__msg` with a `triangle-alert` icon; the edge turns `danger-text`. Disabled: the `disabled` attribute, `is-disabled` on the field and a hint saying why. Read-only: the `readonly` attribute; the box loses its edge and sits on `bg-subtle`. Loading (checking a value on the server): an `es-spinner` at the end of the group and a polite hint (`Đang kiểm tra mã.`).

**Long content** scrolls inside the box; the field never grows sideways. Messages wrap under the field.

The consumer provides: the label, `id`/`for`, the placeholder example, the hint or error text, and the state attributes.

**Do** write the error as what to do (`Mã DA01 đã dùng cho Dãy trọ Dĩ An Demo.`). **Don't** use the placeholder as the label, mark errors with colour alone, or put field errors in a toast.
