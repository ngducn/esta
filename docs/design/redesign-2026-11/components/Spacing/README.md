# Spacing

Spacing, radius, borders, elevation and the focus ring: the shape tokens every component is built from.

The page shows each `space-*` step as a bar with its pixel value and a typical use, every radius with what it is for, the three stroke widths, the four shadows on a card over the page ground, and the focus ring on `bg`, `surface` and `surface-raised`, in light and dark.

Rules:

- 4px base. Inside a component 2–16, between components 16–32, between sections 32–48.
- Radius by size of thing: 4 checkbox, 6 chip, 8 control, 12 card, 16 modal, 24 sheet top, full for pills.
- Every border is a 1px hairline; `border-field` edges anything you type into or tick; 1.5px only for checkbox, radio and the completeness ring.
- Hairline first, shadow second: `shadow-xs` cards at rest, `sm` hover and bottom nav, `md` menus and toasts, `lg` modals and sheets.
- Focus is `outline: 2px solid var(--focus-ring); outline-offset: 2px` on `:focus-visible`, never a box-shadow that moves layout.
