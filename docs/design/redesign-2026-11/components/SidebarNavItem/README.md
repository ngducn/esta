# Sidebar nav item

A sidebar nav item is one destination in the desktop sidebar: an icon and a word, with the current page marked by a blue tint, blue text and semibold. Markup: `<a class="es-nav-item" href="…" aria-current="page"><i data-icon="building-2"></i><span class="es-nav-item__label">Tài sản</span></a>` inside `<nav class="es-nav" aria-label="Điều hướng chính">`.

**States.** Default `text-secondary`; hover `fill-hover` with `text`; pressed `fill-pressed`; current (`aria-current="page"`) `accent-subtle`, `accent-text`, weight 600, and `accent-subtle-hover` on hover; focus-visible an inset 2px ring so it never collides with its neighbours. 44px tall in Thoáng, 40px in Gọn with a mouse.

**Count.** `es-count` after the label, digits only, for things that need her: overdue rooms on `Thu tiền`. Its `aria-label` says what it counts (`2 phòng quá hạn`). `--neutral` for counts that are not urgent.

**Long labels** wrap and balance; they never truncate.

**Sidebar.** `es-sidebar` is 256px (`sidebar-width`): brand (the outlined ESTA wordmark, `es-brand__word`; the rail shows the E tile, `es-brand__mark`), the family switcher, the main nav (`Tổng quan`, `Tài sản`, `Thu tiền`, `Tài liệu`, `Trợ lý`), an `es-nav__label` group `Khác` (`Báo cáo`, `Cài đặt`), and the member block (`es-member`) pinned to the bottom, which opens the account menu.

**Rail.** From 840 to 1079px add `es-sidebar--rail`: icons only, labels become the accessible name and a tooltip to the right on hover and focus, counts become a badge on the icon, group labels become a hairline.

The consumer provides: the href, icon, label, `aria-current` on the current page, and any count.

- Do: keep the order fixed; Mẹ finds things by position.
- Don't: mark the current page by colour alone, or hide labels at full width.
