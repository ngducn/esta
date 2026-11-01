# Bottom nav item

A bottom nav item is one of the five destinations in the phone's tab bar: an icon over a word, with the current tab marked by a blue pill behind the icon. Markup: `<nav class="es-tabbar" aria-label="Điều hướng chính"><a class="es-tab" href="…" aria-current="page"><span class="es-tab__icon"><i data-icon="banknote"></i></span>Thu tiền</a>…</nav>`.

**Tabs.** `Tổng quan`, `Tài sản`, `Thu tiền`, `Tài liệu`, `Trợ lý`, always in that order. Settings, reports and the account live in the account menu, opened from the header avatar.

**Bar.** `surface` with a top hairline, at least `bottom-nav-height` (64px) plus `env(safe-area-inset-bottom)` (`--tabbar-safe`), so it never sits under the home indicator.

**States.** Default `text-secondary`; current `accent-text`, weight 600, and an `accent-subtle` pill (56 × 32) behind the icon; pressed a `fill-pressed` pill; focus-visible an inset ring around the whole tab. A count (`es-count`) sits on the icon's top right, with its meaning in `aria-label`.

**Text size.** Labels are 13px/17px and wrap to two lines at larger text sizes; the bar grows rather than truncating or hiding a label. At 130% on a 390 phone only `Tổng quan` wraps.

The consumer provides: the five hrefs, `aria-current` on the current tab, and any count.

- Do: keep the label under every icon at every text size.
- Don't: add a sixth tab, or put an action (like `+`) in the bar.
