# Color

Esta's colour is cool slate neutrals with white cards, one Esta blue accent (`#1b5bda`) and five semantic sets, each tuned separately for light and dark.

The page opens with the primary button beside every status badge, so you can see the brand never reads as a status. Then every role token as a swatch with its resolved value, and every contrast pair the components draw, measured live in both themes with its AA, AAA or 3:1 verdict. Ramps close the page.

Rules:

- Components use role tokens (`text`, `surface`, `danger-bg`), never ramp steps.
- Body and second-line text meet AAA (7:1) on every ground; muted text, links and status words meet AA (4.5:1); field edges and the focus ring meet 3:1.
- The accent is the same fill in both themes; hover and pressed step darker in both.
- `info` shares the blue ramp as a tint; the solid accent fill is never a status.
- Colour never carries meaning alone: every status has an icon and a word.
- Red is only for overdue, failed and destroy. Negative amounts stay `text`.
