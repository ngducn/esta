# Button

Use a button for an action; use a link (`es-link`) to go somewhere. Markup: `<button class="es-btn es-btn--primary" type="button"><i data-icon="plus"></i>Ghi nhận tiền</button>`.

**Variants.** `--primary` (blue fill) for the one thing the view is for, at most once per screen or sheet. `--secondary` (surface with a `border-strong` outline) is the default for every other action. `--ghost` for inline and toolbar actions and the dismiss in a pair (`Bỏ qua`). `--danger` (solid red) only on the step that confirms a destructive action, and its label names the object (`Kết thúc hợp đồng`, not `Xác nhận`). `--danger-quiet` opens that step (`Xoá ảnh`).

**Sizes.** Default height follows density (`--control-h`: 48 Thoáng, 40 Gọn). `--sm` (36) for row actions in desktop tables; it clamps to 44 on touch screens. `--lg` (56) for the single primary at the foot of a phone sheet, usually with `--block`.

**Icon-only.** `--icon` is square; desktop toolbars only, with `aria-label` naming the object (`Thêm thao tác cho Phòng 5`) and a `.es-tooltip`. On phones every button has words.

**States.** Hover darkens (light) or lightens (dark) the fill; active goes one step further; focus-visible draws `focus-ring` 2px outside. Disabled is a flat `fill-disabled` with `text-disabled` — say why nearby. Loading keeps the label, swaps the icon slot for `<i data-icon="loader-circle" class="es-spinner">`, sets `aria-busy="true"` and changes the verb to its -ing form (`Đang lưu`).

**Content.** Verb first, sentence case, two to four words. A long label wraps and balances; it never truncates.

The consumer provides: the label, an optional leading icon, `type`, and `disabled`/`aria-busy` state.
