# App shell

Every signed-in page sits in the shell. Below 1024 px a bottom tab bar holds `Tổng quan`, `Tài sản`, `Thu tiền`, `Tài liệu` and `Trợ lý`; at 1024 px and above a 240 px sidebar holds the same five. The header carries the business date line and, on a phone, the `Tài khoản` button that opens the account menu with `Báo cáo`, `Cài đặt`, the language switch and `Đăng xuất`. On a desktop the same menu opens from the member's name at the foot of the sidebar. `/settings` saves language, text scale (100, 115, 130), density and theme.

## Sub-features

- `shell-nav` marks the current section with `aria-current="page"` and a lacquer underline.
- `shell-account-menu` opens the account menu, which closes on Escape, an outside tap, a navigation or a language switch.
- `shell-display-settings` saves language, text scale and density on the member and theme in the `esta_theme` cookie.

## How to get to it (user POV)

- Sign in; every page under `/` shows the shell.
- Tap `Tài khoản` (phone) or the member's name in the sidebar (desktop), then `Cài đặt`, for `/settings`.

## Driving it with the verify skill

Preconditions:

- The baseline in the index holds for your slot.
- Use a fresh `new.lane<n>@demo.esta.test` household for anything that saves settings, so the seeded members keep their defaults.

- **Tabs.** At 390x844, `$S/b.sh click 'role=link[name="Thu tiền"]'`. `$S/b.sh url` ends in `/collections` and `$S/b.sh js 'document.querySelector("[aria-current=page]").textContent'` prints `Thu tiền`.
- **Account menu.** `$S/b.sh click 'role=button[name="Tài khoản"]'`, then `$S/b.sh wait '#account-menu'`. Escape closes it.
- **Text scale.** On `/settings`, `$S/b.sh click 'role=radio[name=/^130%/]'` and `$S/b.sh click 'role=button[name="Lưu"]'`. `$S/b.sh js 'getComputedStyle(document.documentElement).fontSize'` prints `20.8px`, and `select text_scale from household_members` on the member's row shows `130`.
- **Density.** Choose `Gọn` and save. `<html>` carries `data-density="compact"`, and spacing utilities shrink to a 3 px unit.

## Gotchas

- The account menu is a native popover with a 220 ms slide. Wait for it before a screenshot or an axe run.
- The tab bar is sticky, so a full-page screenshot draws it where the viewport ended. Use `$S/b.sh screenshot --viewport` for phone evidence.
- Theme lives in a cookie, so it follows the device, not the member. Language, text scale and density follow the member to every device.
