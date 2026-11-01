# Foundations

## Typeface: Inter

Set everything in **Inter** (variable, weights 400–600, optical size 14–32), self-hosted as `fonts/Inter-Variable.woff2`, the same subset Esta ships (basic Latin, the Vietnamese block, ₫, `tnum`). The *Typeface* page sets the three candidates side by side on a real Vietnamese specimen and measures them live.

Measured in Chromium at 100px (Inter from the shipped file; Be Vietnam Pro and Plus Jakarta Sans from Google Fonts), 2026-10-31:

| | Inter | Be Vietnam Pro | Plus Jakarta Sans (prototype) |
| --- | --- | --- | --- |
| Top of **Ỗ** above baseline | 1.06 em | 1.15 em | 1.18 em |
| Bottom of **ặ** below baseline | 0.21 em | 0.23 em | 0.19 em |
| Clearance at line-height 1.3 (Ỗ under ặ) | **+0.03 em, clear** | −0.07 em, collides | −0.07 em, collides |
| `1.111.111` vs `8.888.888` with `tabular-nums` | 161.6 / 161.6 px, equal | 104.6 / 160.3 px, **no tabular figures** | 152.7 / 152.7 px, equal |
| Specimen sentence at 16px | 640 px | 655 px (+2%) | 618 px (−3%) |

Why Inter: it is the only one of the three whose stacked capitals (Ỗ, Ẫ, Ở) clear the dot-below of the line above at Esta's 1.3 minimum leading, so a tight two-line card title never collides; its tabular figures work, so amounts line up in every column; and its width sits between the other two (all three within 3%), so it costs nothing at 130% text size. Be Vietnam Pro draws beautiful, purpose-built Vietnamese, but its stacks are taller and the served build ignores `tabular-nums`, so every money column would jitter. Plus Jakarta Sans, the prototype's face, has the tallest stacks and its geometric width costs a word per line at 130%; Ryan also retired it on 2026-10-24 because its bold weights made screens heavy.

Rules: weights 400 (reading), 500 (labels, amounts), 600 (titles, summary figures); nothing heavier. Never letter-space Vietnamese body text; never uppercase labels in the app. Let the browser pick the optical size (`font-optical-sizing: auto`), which tightens headings automatically.

**Inter Display, for the brand layer only.** Inter's display optical size, self-hosted as `fonts/InterDisplay-Light.woff2` (300) and `fonts/InterDisplay-Medium.woff2` (500), Latin and the Vietnamese block merged into one file each. Measured: Ỗ rises 1.06 em and ặ drops 0.20 em, so headlines keep a leading of at least 1.2. Light is used only at 32px and above; Medium carries the spaced capitals (`brand-eyebrow`, +0.18em) and the ESTA wordmark. It never appears in the app, where a thin weight would cost Mẹ legibility.

## Type scale

Sizes are rem, so the member's text size (Cài đặt → Cỡ chữ: 100, 115, 130%) scales the root and everything follows. The *Type scale* page renders the whole scale at all three.

| Style | Size / line | Weight | Tracking | Use |
| --- | --- | --- | --- | --- |
| `display` | 40 / 52 | 600 | −0.022em | One per screen at most: onboarding, a one-figure page |
| `title-1` | 30 / 40 | 600 | −0.02em | Page title on desktop |
| `title-2` | 24 / 32 | 600 | −0.016em | Page title on phones, section title on desktop |
| `title-3` | 20 / 28 | 600 | −0.01em | Card group, modal and sheet titles |
| `headline` | 18 / 26 | 600 | −0.006em | Card title, property name, first line of a mobile row |
| `body` | 16 / 24 | 400 | 0 | All running text; the floor for anything Mẹ acts on |
| `body-strong` | 16 / 24 | 500 | 0 | Primary cell of a row, names inside text |
| `label` | 15 / 20 | 500 | 0 | Buttons, field labels, nav items |
| `body-sm` | 15 / 22 | 400 | 0 | Second lines, helper and error text |
| `caption` | 14 / 20 | 400 | +0.004em | Timestamps, counts, badge words |
| `figure-xl` | 40 / 52 | 600 | −0.022em | The one summary figure of a hero card |
| `figure-lg` | 32 / 42 | 600 | −0.02em | Stat card value, the amount in the payment sheet |
| `figure-md` | 24 / 32 | 600 | −0.012em | Secondary stat, property rent, a total |
| `amount` | 16 / 24 | 500 | 0 | Amounts in tables and lists |

Brand layer only (Inter Display):

| Style | Size / line | Weight | Tracking | Use |
| --- | --- | --- | --- | --- |
| `brand-hero` | 96 / 116 | 300 | −0.035em | The one split headline of a website hero or sign-in page |
| `brand-title` | 56 / 68 | 300 | −0.025em | Website sections, onboarding steps, report covers |
| `brand-figure` | 64 / 78 | 300 | −0.03em | One large figure on a marketing card, unit raised |
| `brand-eyebrow` | 12 / 16 | 500 | +0.18em | Spaced capitals above a headline or figure |

Why: the old scale stepped 15–16–18–20 at near-equal weight, so a card title and its body looked alike. The new top end steps by about 1.25× and pairs 600 titles with 400 body and `text-secondary` second lines, so size, weight and colour each carry one level. Every line height is ≥ 1.3× its size and a multiple of 2px.

## Colour

Five ramps in OKLCH, converted to sRGB hex: `slate` (cool neutral, hue 260, chroma ≤ 0.02), `blue` (brand and info, hue 262), `green`, `amber`, `red`. Components use roles, never ramps.

- **Neutrals are cool and quiet.** `bg` `#f5f7f9` is a clean light grey, cards are white `#ffffff`, `text` `#15191f` is near-black slate. The faint blue bias ties the greys to the brand without tinting anything. Dark mode is not an inversion: its ground `#0f1217`, card `#15191f` and raised `#1d2128` are their own steps, so dark reads as a calm slate rather than flat black. In dark, elevation comes from lighter surfaces; shadows are kept but barely read.
- **The accent is Esta blue** (`accent` `#1b5bda`). Why blue: it is the conventional colour of trust for money, the one Mẹ already sees in her bank app and on every VietQR sheet, so Esta looks like something that belongs next to them. It sits 125° from danger red and far from amber, so a primary button never reads as a warning. The same fill serves both themes; hover (`blue-700`) and pressed (`blue-800`) darken in both, so `on-accent` stays ≥ 5.8:1.
- **Info shares the brand blue.** Draft and tips are the one status that never asks for attention, so they borrow the brand hue as a tint (`info-bg`, `info-text`) with their icon and word. The accent fill itself is never a status.
- **Semantic sets** each have `-text`, `-bg`, `-border`, `-solid` and `on-`: `success` (paid), `warning` (due soon), `danger` (overdue, failed, destroy), `info` (draft, tips), `neutral` (empty, ended). Light uses step 700 on 50; dark uses 300 on 950. `-solid` is the same in both themes.
- **Never colour alone.** Every status has an icon and a word. Success and danger also differ in lightness from each other in both themes.

### Contrast

Text pairs meet WCAG AA (4.5:1); body text meets AAA (7:1); focus rings, field edges and other meaningful marks meet 3:1. Every pair the components draw, computed from the token values (the *Color* page recomputes them live in both themes):

| Pair | Kind | Min | Light | Dark |
| --- | --- | --- | --- | --- |
| `text` on `bg` | body text (AAA) | 7:1 | 16.42 | 17.47 |
| `text` on `bg-subtle` | body text (AAA) | 7:1 | 16.92 | 15.04 |
| `text` on `surface` | body text (AAA) | 7:1 | 17.64 | 16.42 |
| `text` on `surface-raised` | body text (AAA) | 7:1 | 17.64 | 15.04 |
| `text-secondary` on `bg` | secondary text (AAA) | 7:1 | 8.07 | 10.14 |
| `text-secondary` on `surface` | secondary text (AAA) | 7:1 | 8.66 | 9.53 |
| `text-secondary` on `surface-raised` | secondary text (AAA) | 7:1 | 8.66 | 8.73 |
| `text-muted` on `bg` | muted text (AA) | 4.5:1 | 5.48 | 6.54 |
| `text-muted` on `bg-subtle` | muted text (AA) | 4.5:1 | 5.64 | 5.62 |
| `text-muted` on `surface` | muted text (AA) | 4.5:1 | 5.88 | 6.14 |
| `text-muted` on `surface-raised` | muted text (AA) | 4.5:1 | 5.88 | 5.62 |
| `text-inverse` on `surface-inverse` | toast text (AAA) | 7:1 | 16.92 | 15.29 |
| `text-inverse-accent` on `surface-inverse` | toast action (AA) | 4.5:1 | 9.40 | 6.69 |
| `accent-text` on `bg` | link / active nav (AA) | 4.5:1 | 7.19 | 10.00 |
| `accent-text` on `surface` | link / active nav (AA) | 4.5:1 | 7.72 | 9.40 |
| `accent-text` on `accent-subtle` | link / active nav (AA) | 4.5:1 | 7.12 | 8.72 |
| `on-accent` on `accent` | primary button label (AA) | 4.5:1 | 5.91 | 5.91 |
| `on-accent` on `accent-hover` | primary button label (AA) | 4.5:1 | 7.72 | 7.72 |
| `on-accent` on `accent-pressed` | primary button label (AA) | 4.5:1 | 10.08 | 10.08 |
| `focus-ring` on `bg` | focus ring (non-text 3:1) | 3:1 | 5.50 | 6.95 |
| `focus-ring` on `surface` | focus ring (non-text 3:1) | 3:1 | 5.91 | 6.53 |
| `focus-ring` on `surface-raised` | focus ring (non-text 3:1) | 3:1 | 5.91 | 5.98 |
| `border-field` on `bg` | field edge (non-text 3:1) | 3:1 | 3.91 | 4.46 |
| `border-field` on `surface` | field edge (non-text 3:1) | 3:1 | 4.20 | 4.19 |
| `success-text` on `success-bg` | success badge (AA) | 4.5:1 | 6.02 | 9.09 |
| `success-text` on `surface` | success word on card (AA) | 4.5:1 | 6.46 | 10.42 |
| `success-text` on `bg` | success word on ground (AA) | 4.5:1 | 6.01 | 11.09 |
| `on-success` on `success-solid` | success solid label (AA) | 4.5:1 | 4.64 | 4.64 |
| `warning-text` on `warning-bg` | warning badge (AA) | 4.5:1 | 5.53 | 9.33 |
| `warning-text` on `surface` | warning word on card (AA) | 4.5:1 | 5.94 | 10.82 |
| `warning-text` on `bg` | warning word on ground (AA) | 4.5:1 | 5.53 | 11.52 |
| `on-warning` on `warning-solid` | warning solid label (AA) | 4.5:1 | 7.28 | 7.28 |
| `danger-text` on `danger-bg` | danger badge (AA) | 4.5:1 | 6.51 | 8.44 |
| `danger-text` on `surface` | danger word on card (AA) | 4.5:1 | 7.11 | 9.40 |
| `danger-text` on `bg` | danger word on ground (AA) | 4.5:1 | 6.62 | 10.00 |
| `on-danger` on `danger-solid` | danger solid label (AA) | 4.5:1 | 5.39 | 5.39 |
| `info-text` on `info-bg` | info badge (AA) | 4.5:1 | 7.12 | 8.72 |
| `info-text` on `surface` | info word on card (AA) | 4.5:1 | 7.72 | 9.40 |
| `info-text` on `bg` | info word on ground (AA) | 4.5:1 | 7.19 | 10.00 |
| `on-info` on `info-solid` | info solid label (AA) | 4.5:1 | 5.91 | 5.91 |
| `neutral-text` on `neutral-bg` | neutral badge (AA) | 4.5:1 | 7.51 | 7.80 |
| `neutral-text` on `surface` | neutral word on card (AA) | 4.5:1 | 8.66 | 9.53 |
| `neutral-text` on `bg` | neutral word on ground (AA) | 4.5:1 | 8.07 | 10.14 |
| `on-neutral` on `neutral-solid` | neutral solid label (AA) | 4.5:1 | 8.66 | 6.78 |

## Space, shape, depth

- **Spacing** on a 4px base: `space-0.5` 2 · `space-1` 4 · `space-1.5` 6 · `space-2` 8 · `space-3` 12 · `space-4` 16 · `space-5` 20 · `space-6` 24 · `space-8` 32 · `space-10` 40 · `space-12` 48 · `space-16` 64 · `space-20` 80. Inside a component use 2–16; between components 16–32; between sections 32–48.
- **Radius**: `radius-xs` 4 (checkbox) · `radius-sm` 6 (tooltip, chip) · `radius-md` 8 (button, input, nav item) · `radius-lg` 12 (card, table, menu, toast, selection card) · `radius-xl` 16 (modal, property card) · `radius-2xl` 24 (top of a phone sheet) · `radius-full` (badge, avatar, switch, and the brand layer's pill buttons). Why smaller than the prototype's 10/12/16: tighter corners read as precise; the warmth comes from colour and photos, not from pillowy shapes.
- **Borders**: `stroke-hairline` 1px for every border. `border` is decorative (cards, dividers); `border-field` (≥ 3:1) is the edge of anything you type into or tick. `stroke-strong` 1.5px only for checkbox, radio and the completeness ring.
- **Elevation**: hairline first, shadow second. `shadow-xs` cards at rest · `shadow-sm` hovered clickable card, bottom nav, scrolled sticky header · `shadow-md` menus, popovers, toasts · `shadow-lg` modals and sheets over `scrim`. No coloured shadows, no inner shadows, no glow.
- **Focus ring**: `outline: 2px solid var(--focus-ring); outline-offset: 2px` on `:focus-visible`. `focus-ring` is brand blue in light (`blue-600`) and a lighter blue in dark (`blue-400`), ≥ 3:1 on `bg`, `surface` and `surface-raised` in both themes. It is an outline, so nothing moves when it appears.

## Density: Thoáng and Gọn

| Variable | Thoáng (default) | Gọn |
| --- | --- | --- |
| `--control-h` (button, input, select) | 48 | 40 (44 on touch) |
| `--row-h` (table row) | 64 | 44 |
| `--list-row-h` (two-line list row) | 72 | 56 |
| `--card-pad` | 24 (16 on phones) | 16 |
| `--cell-x` (table cell sides) | 16 | 12 |
| `--stack` (gap between blocks) | 24 | 16 |
| `--field-gap` (between fields) | 20 | 12 |

Set `data-density="gon"` on `<html>` or any container. Gọn changes spacing only: type sizes, icon sizes and touch targets never shrink. Why: Ryan scans 30 rows at a desk; Mẹ taps one row in the sun. Same components, two rhythms.

## Iconography

- **Set**: Lucide (ISC), the set the app already imports from `lucide-react`. Outline only; never mix in filled or duotone icons, emoji or Unicode symbols.
- **Stroke**: 1.75 at 16–24px; 2 at 14px so a small glyph keeps its weight; round caps and joins.
- **Size follows the text beside it**: `icon-xs` 14 with `caption` (inside badges) · `icon-sm` 16 with `label` and `body-sm` · `icon-md` 20 with `body` and `headline` · `icon-lg` 24 in the bottom nav and empty states.
- **Optical alignment**: centre the icon on the first line's x-height middle, not the line box: in a one-line row use `align-items: center`; in a multi-line block, align to the first line with `margin-top: calc((line-height − icon) / 2)`. Gap to text is `space-2` (8) at 16–24px and `space-1.5` (6) at 14px. Icons inherit `currentColor`; in a nav item or badge they take the same colour as the word.
- **Status icons**: paid `circle-check` · due soon `clock` · overdue `triangle-alert` · empty `circle-dashed` · draft `pencil-line` · ended `archive`. Silhouettes differ, so status reads even in grayscale.

## Motion

| Token | Value | Moves |
| --- | --- | --- |
| `duration-fast` | 120ms | Hover, press, colour, border, focus ring |
| `duration-base` | 180ms | Switch thumb, checkbox tick, menu open, toast enter, exits |
| `duration-slow` | 240ms | Modal enter, row insert, accordion |
| `duration-sheet` | 300ms | Phone bottom sheet slide-up |

Easing: `ease-standard` for in-place change, `ease-enter` (fast start, long calm settle, no overshoot) for arrivals, `ease-exit` for departures. Exits are always shorter than entries.

**Never animate**: money values (no counting up; a changed amount cross-fades once), table rows on sort or filter, page transitions, skeleton shimmer sweeps (skeletons hold still or pulse opacity once a second), anything looping that is not a spinner, parallax, bounce, confetti, typing dots for Trợ lý.

**Reduced motion** (`prefers-reduced-motion: reduce`): transforms are removed; sheets and modals appear in place with a 120ms opacity fade; spinners stop and the label says what is happening.

## Layout

| Breakpoint | Min width | Shell |
| --- | --- | --- |
| phone | 0 | Bottom nav (5 items), page header with date and account; 4-column grid, 16 gutters, 16 page padding |
| `bp-sm` | 600 | 2-column card grids; tables still collapse to lists |
| `bp-md` | 840 | Icon rail sidebar; tables become tables; 8 columns, 24 gutters, 32 padding |
| `bp-lg` | 1080 | Full 256px sidebar with labels; 12 columns, 24 gutters |
| `bp-xl` | 1440 | Content stops widening; margins grow |

Maximum content width by page type: forms and settings `width-form` 640 · Trợ lý thread and reading `width-reading` 720 · lists and tables `width-list` 1120 · Tổng quan and property grid `width-dashboard` 1280.

**Safe areas on phones**: the bottom nav is `bottom-nav-height` (64) plus `env(safe-area-inset-bottom)`; page content pads its bottom by the same sum plus `space-4`. Toasts and a sheet's sticky footer sit above the nav and inset; nothing interactive lives in the home-indicator zone. The header respects `env(safe-area-inset-top)` in the installed PWA.
