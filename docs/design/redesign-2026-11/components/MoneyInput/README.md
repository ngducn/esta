# Money input

A money field that takes Vietnamese shorthand (`3tr5`, `1ty2`, `850k`, `3.500.000`) and confirms the exact amount and its words live under the box. Markup:

```html
<div class="es-field es-money">
  <label class="es-field__label" for="amt">Số tiền đã nhận</label>
  <div class="es-input-group"><input class="es-input" id="amt" data-es-money inputmode="text" autocomplete="off" aria-describedby="amt-out"><span class="es-affix">₫</span></div>
  <p class="es-money__out"><i data-icon="triangle-alert" data-size="16"></i><span id="amt-out" data-es-money-out data-empty="Nhập 3tr5, 850k hoặc 3.500.000" aria-live="polite"></span></p>
  <p class="es-money__words" data-es-money-words></p>
</div>
```

`Esta.bind()` wires every `[data-es-money]`: it parses with the same rules as `packages/core` (`parseVnd`), writes `= 3.500.000 ₫` and `Ba triệu năm trăm nghìn đồng`, and on a refusal sets `is-error` on the field, `aria-invalid` on the input and the reason in words.

**Refusals, never guesses.** `3,5` (a fraction of a đồng), `1.500,000` (mixed separators) and amounts over 1.000 tỷ are refused with a way to write them; `3,5tr` and `3tr5` both mean 3.500.000 ₫. The line uses `=`, not `≈`: the amount is exact. `≈` is kept for estimates.

**Sizes.** Default for forms. `es-money--lg` sets the amount in figure-lg (32/42, 600) in a `control-lg` box, for the one amount a record-payment sheet is about. Neither size changes with density.

**States.** As the text input: hover, focus-visible on the group, disabled (`is-disabled` on group and field, with a reason), read-only (`is-readonly` on the group), loading (`es-spinner` before the affix and a polite hint such as `Đang lấy số tiền từ hợp đồng.`).

**Keyboard.** `inputmode="text"`, because the shorthand needs letters; a numeric keypad would hide `tr` and `k`.

The consumer provides: the label, `id`, the initial value, the empty hint, and the integer it saves (read it from `parseVnd`, never from the display line).

**Do** show the words line wherever an amount is typed. **Don't** reformat the input while Mẹ types, or accept an amount the line has not confirmed.
