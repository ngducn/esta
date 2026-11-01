# Toast

A toast confirms something that just happened and, when it can be undone, offers `Hoàn tác`. Markup: `<div class="es-toast es-toast--success" role="status"><i class="es-toast__icon" data-icon="circle-check"></i><p class="es-toast__msg">…</p><div class="es-toast__actions"><button class="es-toast__action" type="button">Hoàn tác</button></div></div>`, inside one `.es-toaster` region per page.

**Variants.** `--success` for a saved change: `role="status"`, `circle-check`, dismisses itself after 8 seconds when it carries `Hoàn tác`, 4 seconds otherwise, and pauses while hovered or focused. `--error` for a save that failed: `role="alert"`, `circle-alert`, a `Thử lại` action, and it stays until closed. The surface is `surface-inverse` with `text-inverse`, so it reads as a passing note in both themes; actions use `text-inverse-accent`, icons use the opposite theme's success or danger ramp step.

**Placement.** `.es-toaster` puts it above the bottom nav and the safe area on phones (full width minus the gutter), and at the bottom left of the content on desktop, clear of the sidebar. Newest on top, three at most.

**States.** Action hover adds a 12% `text-inverse` wash; focus-visible draws an inset ring in `text-inverse-accent`. On touch screens actions are 44px tall and the × hides, since a toast is dismissed by waiting or by its action. Arrival is a short rise (`duration-base`, `ease-enter`); under reduced motion it fades in place.

**Content.** What happened, with the amount and the room: `Đã ghi nhận 3.500.000 ₫ từ Phòng 5.` Errors say what to do: `Chưa lưu được. Kiểm tra mạng rồi thử lại.` Long messages wrap; the actions stay on the first line.

The consumer provides: the message, the tone, the action and its handler, and the region's position in the page.

- Do: put `Hoàn tác` on anything reversible instead of asking first.
- Don't: use a toast for a field error (it belongs under the field) or for anything she must read later.
