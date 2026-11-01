# Account menu

The account menu shows who is signed in and holds the four display settings Mẹ actually changes: text size, theme, density and language. Markup: an `es-menu es-menu--wide` with `es-menu__head`, four `es-menu__setting` groups each holding an `es-segmented`, then `es-menu__item` links, opened from the sidebar member block (`es-member`) or the phone header avatar.

**Order.** Head (avatar lg, name, role and email); `Cỡ chữ` (100% · 115% · 130%), `Giao diện` (Sáng · Tối), `Mật độ` (Thoáng · Gọn), `Ngôn ngữ` (Tiếng Việt · English); separator; `Báo cáo`, `Cài đặt`; separator; `Đăng xuất`.

**Settings apply on tap.** Each is an `es-segmented`: a radio group showing every option, the selected one in `accent-subtle` with `accent-text`, an `accent-border` edge and weight 600. No Lưu button. Language options carry their own `lang`.

**Items.** 44px tall, icon in `text-secondary`, label in `text`. Hover `fill-hover`, pressed `fill-pressed`, focus-visible an inset ring. Inside dark raised surfaces both step one shade up so they stay visible. Arrow keys move between items, Escape closes and returns focus to the trigger.

**Phones.** The same list opens as a bottom sheet from the header avatar, with `Đóng` in the head.

**Menu.** `es-menu` is shared with the family switcher: `surface-raised`, hairline border, `radius-lg`, `shadow-md`, 320px (`--wide` 358px), arriving with a 4px drop and fade.

The consumer provides: the user's name, role and email, the current value of each setting and the change handlers.

- Do: apply a setting the moment it is tapped and keep the menu open so she sees the change.
- Don't: move these four settings into the Cài đặt page only.
