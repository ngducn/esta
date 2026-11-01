# Switch

An on/off for a setting that takes effect the moment it moves, with `Bật` or `Tắt` written beside the track. Markup:

```html
<label class="es-switch">
  <span class="es-switch__text">Nhắc tiền thuê<span class="es-switch__hint">…</span></span>
  <span class="es-switch__side">
    <span class="es-switch__state" aria-hidden="true">Bật</span>
    <input type="checkbox" role="switch" class="es-switch__input" checked>
    <span class="es-switch__track"><span class="es-switch__thumb"></span></span>
  </span>
</label>
```

The input must come directly before `es-switch__track`. The row is at least 44px and the whole row is the hit area. The track is 44 × 24 with a 20px thumb.

**Colour.** Off is `border-field`, which meets 3:1 against the page in both themes; on is blue. The thumb is a near-white `surface` with `shadow-sm` in both themes and slides `duration-base` on `ease-standard`.

**States.** Hover lightens or darkens the track; active lifts the thumb shadow; focus-visible rings the track only. Loading: `is-loading` and `aria-busy`, an `es-spinner` and `Đang lưu` in the side. Error: the switch moves back to where it was and an `es-field__msg` follows the row (`Chưa lưu được. Kiểm tra mạng rồi thử lại.`). Disabled: `is-disabled`, the `disabled` attribute and a hint that says how to enable it.

`es-switch-list` stacks switches with a hairline between rows for a settings page.

The consumer provides: the label, an optional hint, the state word, `checked`/`disabled`, and the save call with its rollback.

**Do** save immediately and say so when it fails. **Don't** put a switch in a form that waits for Lưu (use a checkbox), or rely on the thumb's position alone.
