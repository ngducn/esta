# Checkbox

A 20px box on a row at least 44px tall, for a yes/no that is saved with the form; the whole row, label included, is the hit area. Markup:

```html
<label class="es-check">
  <input type="checkbox" class="es-check__input">
  <span class="es-check__box"><i data-icon="check" data-size="14" class="es-check__tick"></i><i data-icon="minus" data-size="14" class="es-check__dash"></i></span>
  <span class="es-check__text">Có sổ hồng<span class="es-check__hint">…</span></span>
</label>
```

The input is visually hidden but real, so keyboard, screen readers and forms work unchanged; it must come directly before `es-check__box`.

**States.** Unchecked has a 1.5px `border-field` edge on `surface`. Checked fills blue with a white tick. Indeterminate (“some of these”): set `input.indeterminate = true` and `is-indeterminate` on the label for a blue box with a dash. Hover moves the edge to `text-muted` (checked: `accent-hover`); active presses to `fill-pressed`; focus-visible rings the box only. Error: `is-error` and an `es-field__msg` below. Disabled: the `disabled` attribute plus `is-disabled`.

**Groups.** Wrap related boxes in `fieldset.es-fieldset` with a `legend`.

**Long content** wraps under the label; the box stays on the first line.

The consumer provides: the label, an optional hint, `checked`/`indeterminate`/`disabled`, and the group legend.

**Do** use a checkbox for choices saved with Lưu. **Don't** use it for a setting that applies at once (use a switch), or shrink the row under 44px in Gọn.
