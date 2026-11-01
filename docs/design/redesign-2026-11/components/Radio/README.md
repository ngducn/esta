# Radio

One choice out of two to five, all visible, grouped in a `fieldset` with a `legend`. Markup:

```html
<fieldset class="es-fieldset">
  <legend>Kỳ thu tiền</legend>
  <label class="es-radio"><input type="radio" class="es-radio__input" name="cycle" checked><span class="es-radio__dot"></span><span class="es-radio__text">Hằng tháng</span></label>
  …
</fieldset>
```

The row is at least 44px and the whole row is the hit area. The input is real and visually hidden; it must come directly before `es-radio__dot`.

**States.** Unchecked: a 20px ring in `border-field`. Checked: blue fill with a white dot. Hover moves the edge to `text-muted` (checked: `accent-hover`); active presses to `fill-pressed`; focus-visible rings the dot. Disabled: the `disabled` attribute plus `is-disabled`.

**Error** belongs to the group: `is-error` on the fieldset turns every ring `danger-text`, and one `es-field__msg` sits after the last option (`Chọn Tiền mặt hoặc Chuyển khoản.`).

**Long content** and hints (`es-radio__hint`) wrap; the dot stays on the first line.

The consumer provides: the legend, the options with labels and optional hints, one shared `name`, the chosen value.

**Do** order options the way Mẹ thinks of them (most common first). **Don't** use radios for more than five options (use a select) or for options that need an icon and a sentence (use selection cards).
