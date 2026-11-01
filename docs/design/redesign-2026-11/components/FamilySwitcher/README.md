# Family switcher

The family switcher shows which household is open and lets an admin switch to another; it is an identity block with a chevron, never a field. Markup: `<button class="es-switcher" type="button" aria-haspopup="menu" aria-expanded="false"><span class="es-switcher__mark"><i data-icon="house"></i></span><span class="es-switcher__text"><span class="es-switcher__name">Nhà Demo</span><span class="es-switcher__sub">5 tài sản · 10 phòng</span></span><i class="es-switcher__chev" data-icon="chevrons-up-down"></i></button>`.

**Why not a select.** A bordered box with a value reads as something to type into. The switcher has no border and no inset: a monogram square (`accent-subtle` with `accent-text`), the name in body-strong, a caption that says what is inside, and `chevrons-up-down` in `text-muted`.

**States.** Hover `fill-hover`; pressed and open (`aria-expanded="true"`) `fill-pressed`; focus-visible an inset ring. A long name stays on one line with an ellipsis and the full name in `title`.

**Open.** An `es-menu` below it: a `Gia đình` label, one `menuitemradio` per household with its mark, name and counts, a check on the current one, a separator, then `Quản lý thành viên`. Arrow keys move, Enter switches, Escape closes and returns focus. Switching reloads the page into that household.

**Compact.** `--compact` in the phone header: small mark, name in headline weight, `chevron-down`, no caption. The avatar beside it opens the account menu.

With one household, the switcher still shows the identity block but has no chevron and is not a button.

The consumer provides: the household name and counts, the list of households, and the switch handler.

- Do: show the household's own name as the family calls it.
- Don't: add a border, a placeholder or a search field to it.
