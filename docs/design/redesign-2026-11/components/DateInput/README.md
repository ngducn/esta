# Date input

A date field that takes typed `dd/mm/yyyy` (or `7/10/26`) and confirms the weekday below, with a calendar button as a second way in. Markup:

```html
<div class="es-field es-date">
  <label class="es-field__label" for="d">Ngày nhận tiền</label>
  <div class="es-input-group"><input class="es-input" id="d" data-es-date inputmode="numeric" autocomplete="off" placeholder="dd/mm/yyyy" aria-describedby="d-out">
    <button type="button" class="es-btn es-btn--ghost es-btn--icon es-btn--sm" aria-label="Mở lịch" aria-expanded="false"><i data-icon="calendar"></i></button></div>
  <p class="es-date__out"><i data-icon="triangle-alert" data-size="16"></i><span id="d-out" data-es-date-out data-empty="Ví dụ 07/10/2026" aria-live="polite"></span></p>
</div>
```

`Esta.bind()` wires every `[data-es-date]`: a valid date shows `Thứ Tư, 07/10/2026`; `31/02/2026` shows `Không có ngày này. Kiểm tra lại ngày và tháng.`; anything else shows `Nhập theo dạng 07/10/2026.`

**Calendar.** `es-calendar` opens below the field from the button. Weeks start on Monday (`T2 … CN`); days outside the month are `is-outside`; today has `aria-current="date"` and a ring; the chosen day has `aria-selected="true"` and the blue fill. Each day is a 44px target. The foot names today in words and offers `Chọn hôm nay`. On phones the calendar opens in a bottom sheet.

**States.** As the text input. Rules the server checks (`Ngày nhận không được sau hôm nay.`) use a static `is-error` field with `es-field__msg`. Disabled: `is-disabled` on group and field, the calendar icon becomes a plain icon, and a hint says why. Read-only shows the long form as its hint.

The consumer provides: the label, `id`, the value as `dd/mm/yyyy`, the calendar month, today, and the `IsoDate` it saves (from `parseDate`, never from the display line).

**Do** keep typing the main path. **Don't** open the calendar on focus, accept `mm/dd`, or show an ISO date to Mẹ.
