# Selection card

A radio with room for an icon, a title and a sentence, for choosing between two or three options that each need explaining; the only sign of the chosen card is its filled mark. Markup:

```html
<label class="es-choice">
  <input type="radio" class="es-choice__input" name="method">
  <span class="es-choice__body"><i data-icon="banknote"></i>
    <span class="es-choice__text"><span class="es-choice__title">Tiền mặt</span><span class="es-choice__desc">Ghi lại khi cầm tiền trên tay.</span></span></span>
  <span class="es-choice__mark"><i data-icon="check" data-size="14"></i></span>
</label>
```

Put the cards in `es-choice-group` (a grid that fits as many 14rem columns as the width allows) inside `fieldset.es-fieldset` with a `legend`.

**One signal.** Chosen fills the round mark blue with a white tick. The border and the fill do not change, so the hover edge (`border-strong`) and the focus ring around the card are never confused with “chosen”.

**States.** Hover: `border-strong` edge. Active: a brief `fill-hover`. Focus-visible: the ring around the whole card (`:has(:focus-visible)`). Disabled: `is-disabled`, the `disabled` attribute, and the description says how to make it available (`Thêm tài khoản nhận tiền ở Cài đặt để dùng cách này.`). Error belongs to the group: `is-error` on the fieldset turns the marks `danger-text`, with one `es-field__msg` after the group.

**Long content** wraps inside the card; the mark stays on the title's line.

The consumer provides: the legend, an icon, title and description per card, one shared `name`, the chosen value.

**Do** keep to two or three cards. **Don't** tint the chosen card's background or thicken its border, or use cards where a plain radio would do.
