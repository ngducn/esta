---
name: Esta
description: A private, calm app for a Vietnamese family's land, houses and rent.
colors:
  bg: "#f5f7f9"
  bg-subtle: "#fafafc"
  surface: "#ffffff"
  surface-raised: "#ffffff"
  surface-inverse: "#15191f"
  text: "#15191f"
  text-secondary: "#454c57"
  text-muted: "#5e6570"
  text-inverse: "#fafafc"
  border: "#e3e6eb"
  border-strong: "#d5d9e0"
  border-field: "#757c88"
  accent: "#1b5bda"
  accent-hover: "#144bb7"
  accent-pressed: "#103c92"
  on-accent: "#ffffff"
  accent-text: "#144bb7"
  accent-subtle: "#f1f6fe"
  focus-ring: "#1b5bda"
  success-text: "#1b6c3a"
  success-bg: "#ebfbee"
  warning-text: "#975215"
  warning-bg: "#fff6e4"
  danger-text: "#a82522"
  danger-bg: "#fff2f0"
  info-text: "#144bb7"
  info-bg: "#f1f6fe"
  neutral-text: "#454c57"
  neutral-bg: "#eceff3"
  bg-dark: "#0f1217"
  bg-subtle-dark: "#1d2128"
  surface-dark: "#15191f"
  surface-raised-dark: "#1d2128"
  surface-inverse-dark: "#eceff3"
  text-dark: "#f5f7f9"
  text-secondary-dark: "#b9bfc8"
  text-muted-dark: "#9299a4"
  text-inverse-dark: "#15191f"
  border-dark: "#252a32"
  border-strong-dark: "#30353e"
  border-field-dark: "#757c88"
  accent-dark: "#1b5bda"
  accent-hover-dark: "#144bb7"
  accent-pressed-dark: "#103c92"
  on-accent-dark: "#ffffff"
  accent-text-dark: "#9bbefe"
  accent-subtle-dark: "#0b1e44"
  focus-ring-dark: "#689cfe"
  success-text-dark: "#85d99d"
  success-bg-dark: "#0f2a18"
  warning-text-dark: "#fdc061"
  warning-bg-dark: "#3a1f0c"
  danger-text-dark: "#fda79d"
  danger-bg-dark: "#411310"
  info-text-dark: "#9bbefe"
  info-bg-dark: "#0b1e44"
  neutral-text-dark: "#b9bfc8"
  neutral-bg-dark: "#252a32"
typography:
  display:
    fontFamily: "Inter"
    fontSize: "2.5rem"
    fontWeight: 600
    lineHeight: "3.25rem"
    letterSpacing: "-0.022em"
  title-1:
    fontFamily: "Inter"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: "2.5rem"
    letterSpacing: "-0.02em"
  title-2:
    fontFamily: "Inter"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: "2rem"
    letterSpacing: "-0.016em"
  title-3:
    fontFamily: "Inter"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: "1.75rem"
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Inter"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: "1.625rem"
    letterSpacing: "-0.006em"
  body:
    fontFamily: "Inter"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.5rem"
  body-strong:
    fontFamily: "Inter"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: "1.5rem"
  label:
    fontFamily: "Inter"
    fontSize: "0.9375rem"
    fontWeight: 500
    lineHeight: "1.25rem"
  body-sm:
    fontFamily: "Inter"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: "1.375rem"
  caption:
    fontFamily: "Inter"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
    letterSpacing: "0.004em"
  figure-xl:
    fontFamily: "Inter"
    fontSize: "2.5rem"
    fontWeight: 600
    lineHeight: "3.25rem"
    letterSpacing: "-0.022em"
  figure-lg:
    fontFamily: "Inter"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: "2.625rem"
    letterSpacing: "-0.02em"
  figure-md:
    fontFamily: "Inter"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: "2rem"
    letterSpacing: "-0.012em"
  amount:
    fontFamily: "Inter"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: "1.5rem"
rounded:
  "xs": "4px"
  "sm": "6px"
  "md": "8px"
  "lg": "12px"
  "xl": "16px"
  "2xl": "24px"
spacing:
  unit: "0.25rem"
  touch: "2.75rem"
---

# Design System: Esta

## Overview

**Creative North Star: "The calm blue workbench"**

Esta looks like a mature, well-run money product that sits comfortably beside a bank app on Mẹ's phone. A cool light-grey ground, white cards with a hairline and a soft shadow, one family (Inter), and Esta blue `#1b5bda` only for the one primary action, selection and the current page. Warmth comes from the words and the family's own photos, not from the palette. Ryan designed it on 2026-11-01; the source of truth is his design system artifact (https://claude.ai/artifact/8USdYGBumJc9AuaMsQfZKg), copied for offline reading to `docs/design/redesign-2026-11/`. Its `tokens.json` holds every exact value, `components/bundle.css` the CSS of every `es-*` class, and each component folder its anatomy and states.

The primary reader is a parent in her 50s or 60s on a mid-range Android phone at 115 to 130% text size, in Vietnamese, often outdoors. Every token is chosen for her first: 16 px body at the smallest reading size, 44 px touch targets, status as icon plus word plus colour, and contrast proven by script.

**Key characteristics:**

- White cards on a grey ground, structure from hairlines. No card inside a card.
- One primary per view; everything else is secondary or ghost. Red appears only on the confirming step of something that ends.
- Icons beside words, never instead of them on a phone.
- Photos for places, initials for people.
- Light by default whatever the device says; dark only when the member chooses it.

The brand layer (Inter Display Light, split headlines, pill buttons) belongs to sign-in, onboarding and printed covers, and arrives in RD-6. None of it appears inside the app.

## Colors

Role tokens only; the `slate`, `blue`, `green`, `amber` and `red` ramps in `tokens.json` are reference. The source of truth in code is `apps/web/src/design/tokens.ts`, which holds the exact hex of `tokens.json` per theme, and `pnpm tokens:build` writes `apps/web/src/styles/tokens.css` from it. The `-dark` keys above are the same tokens under `[data-theme="dark"]`, which the server sets from the `esta_theme` cookie. No `prefers-color-scheme` rule exists, so a phone set to dark still opens Esta light.

Tailwind utilities carry the role name after the utility: `bg-bg`, `bg-surface`, `bg-surface-raised`, `text-text`, `text-text-secondary`, `text-text-muted`, `border-border`, `border-border-field`, `text-accent-text`, `bg-danger-bg`. The words read twice, but code and design speak one vocabulary.

- **Ground and surfaces.** `bg` (`#f5f7f9`) is the page; `surface` (white) is cards, inputs, the sidebar and the bottom nav; `surface-raised` is menus, sheets and modals; `bg-subtle` is a quiet block inside a card, such as a table header. `surface-inverse` with `text-inverse` is the toast.
- **Text.** `text` (≥ 7:1 everywhere it sits) for reading, `text-secondary` for second lines (also ≥ 7:1), `text-muted` for counts and timestamps (≥ 4.5:1, never on a coloured fill).
- **Lines.** `border` is decorative (cards, dividers); `border-strong` edges a secondary button; `border-field` (≥ 3:1) is the edge of anything you type into or tick.
- **The accent.** `accent` fills the one primary button, checked controls and the brand mark, the same hex in both themes, with `on-accent` ≥ 5.9:1 on it and darker `accent-hover` and `accent-pressed`. `accent-text` is for links and the current nav item; `accent-subtle` marks where you are (current nav item, a pressed chip, a selected segment). The accent fill is never a status and never decoration.
- **Status tones.** `success` (paid), `warning` (due soon), `danger` (overdue, failed, destructive), `info` (draft, tips), `neutral` (empty, ended), each with `-text`, `-bg`, `-border`, `-solid` and `on-`. Amounts stay `text`-coloured even when overdue: the badge says overdue.
- **Focus.** `focus-ring`, blue in light and a lighter blue in dark, ≥ 3:1 on every surface.

### Named Rules

**The Proven Pair Rule.** Every pair the UI draws is listed in `apps/web/src/design/text-pairs.ts`: the contrast table of `01-foundations.md`, widened to every ground. `pnpm contrast:check` (part of `pnpm check`) measures each in both themes, body text at 7:1, other text at 4.5:1, focus rings and field edges at 3:1. It fails on any miss, on a token that is pure black or not a `#rrggbb` hex, on any `text-*` and `bg-*` pair the source draws that the list leaves out, and on any class still spelled in the retired 2026-10 vocabulary (`text-ink`, `bg-ground`, `border-rule`, `text-small`, `figures`, `shadow-card` and the rest).

**The One Primary Rule.** One primary button per view, last in its row. A screen of blue and outline buttons reads as calm.

## Typography

**Font:** Inter (variable, weights 400 to 600, optical size 14 to 32), with a metric-matched Arial fallback.

SIL OFL 1.1, self-hosted from `apps/web/src/fonts/` through `next/font/local` and built by `pnpm fonts:build` from google/fonts commit `7085eb89`. The subset keeps basic Latin, the Latin-1 letters Vietnamese uses, the Vietnamese block, ₫ and common punctuation, plus the text layout features and `tnum`. The design system measured Inter against Be Vietnam Pro and Plus Jakarta Sans (`01-foundations.md`): only Inter clears Ỗ over ặ at a 1.3 leading and keeps working tabular figures.

### Type styles

Use the styles by name; each is a Tailwind `text-*` utility with its size, line height, tracking and (above 400) weight. Sizes are rem, so the member's text size scales them.

| Style | Size / line | Weight | Use |
| --- | --- | --- | --- |
| `display` | 40 / 52 | 600 | One per screen at most |
| `title-1` | 30 / 40 | 600 | Page title on desktop |
| `title-2` | 24 / 32 | 600 | Page title on phones, section title on desktop |
| `title-3` | 20 / 28 | 600 | Card group, modal and sheet titles |
| `headline` | 18 / 26 | 600 | Card title, property name, first line of a phone row |
| `body` | 16 / 24 | 400 | All running text |
| `body-strong` | 16 / 24 | 500 | Primary cell of a row, names inside text |
| `label` | 15 / 20 | 500 | Buttons, field labels, nav items |
| `body-sm` | 15 / 22 | 400 | Second lines, helper and error text |
| `caption` | 14 / 20 | 400 | Timestamps, counts, badge words |
| `figure-xl` | 40 / 52 | 600 | The one summary figure of a hero card |
| `figure-lg` | 32 / 42 | 600 | Stat card value, the amount in the payment sheet |
| `figure-md` | 24 / 32 | 600 | Secondary stat, property rent, a total |
| `amount` | 16 / 24 | 500 | Amounts in tables and lists |

A 400 style sets no weight, so a body-sized line inside a semibold heading keeps the heading's weight.

### Named Rules

**The Figures Rule.** Amounts use the `num` utility (tabular lining figures, `tnum`, never wrapping) and sit right-aligned in tables; `body` already sets tabular figures. A known zero shows `0 ₫` in `text-muted`; an unknown amount shows `—` in `text-muted` with an accessible name, never a false zero. Summary cards show `formatVndCompact` (`42,5 tr`); tables, forms, receipts and QR sheets show the exact amount (`02-money-and-data.md`).

**The Full Coverage Rule.** `pnpm glyphs:check` (part of `pnpm check`) reads every shipped font file at every weight in `typefaces`. It fails on a missing code point, on a missing `tnum`, and on a font file the tokens do not name.

**The Leading Rule.** Line height stays at 1.3 or more, so Vietnamese stacked marks clear the line above; `pnpm check` fails on any type style below 1.3.

**The Weight Ceiling Rule.** Weights 400, 500 and 600 only. There is no `font-bold`, and `apps/web/src/app/globals-css.test.ts` fails if one comes back. Never letter-space Vietnamese body text; never uppercase labels in the app.

**The Accepted Deviations Rule.** The design system states two deviations from its own brief, and Esta accepts both: `caption` is 14 px (the brief said 13), and the money input's parsed preview reads `= 3.500.000 ₫`, because `≈` is reserved for estimates.

## Layout and density

Spacing steps are multiples of 4 px (`p-4` is 16 px) and never change with density. `min-h-touch` is the 44 px minimum target. All sizes are in rem off a root of `100% × --text-scale`, so the member's 115 and 130% text size grows type and spacing together. Breakpoints follow the design system: `sm` 600, `md` 840, `lg` 1080, `xl` 1440.

**Density.** Thoáng is the default; Gọn is for Ryan at a desk. Both set component variables on `:root[data-density]`, and the utilities read them:

| Variable | Utility | Thoáng | Gọn |
| --- | --- | --- | --- |
| `--control-h` | `min-h-control-h` | 48 | 40 (44 on touch) |
| `--row-h` | `h-row-h` | 64 | 44 |
| `--list-row-h` | `min-h-list-row-h` | 72 | 56 |
| `--card-pad` | `p-card-pad` | 24 (16 on phones) | 16 |
| `--cell-x` | `px-cell-x` | 16 | 12 |
| `--stack` | `gap-stack` | 24 | 16 |
| `--field-gap` | `gap-field-gap` | 20 | 12 |

Gọn never shrinks type and never takes a touch target under 44 px. The stored setting keeps its values `comfortable` and `compact`; the labels read Thoáng and Gọn.

**Shell.** Under 840 px a bottom tab bar of five icon-over-word tabs (Tổng quan, Tài sản, Thu tiền, Tài liệu, Trợ lý), the current one marked by an `accent-subtle` pill behind its icon, above the safe-area inset. From 840 px an icon rail; from 1080 px the 256 px sidebar with the ESTA wordmark, nav items (current: `accent-subtle` fill, `accent-text`, weight 600) and the member block. The member block, and the phone header's avatar, open the account menu: Cỡ chữ, Giao diện, Mật độ and Ngôn ngữ as segmented controls that apply on tap, then Báo cáo, Cài đặt and Đăng xuất. Content widths: forms 640, reading 720, lists 1120, dashboards 1280.

A section with no feature yet shows one card: what the section will do and the one action that works today. Never a button, search field or bell for a feature that does not exist.

## Elevation, shape and motion

Hairline first, shadow second: `shadow-xs` for cards at rest, `shadow-sm` for a hovered clickable card and the bottom nav, `shadow-md` for menus, popovers and toasts, `shadow-lg` for modals and sheets over the `scrim`. Dark keeps the same layers with darker values. No coloured or inner shadows, no glow.

Radii: `rounded-xs` 4 (checkbox), `rounded-sm` 6 (tooltip, citation chip), `rounded-md` 8 (buttons, inputs, nav items), `rounded-lg` 12 (cards, menus, toasts), `rounded-xl` 16 (modals, property cards), `rounded-2xl` 24 (top of a phone sheet), `rounded-full` (badges, avatars, switches, chips).

Focus is `outline: 2px solid var(--focus-ring); outline-offset: 2px` on `:focus-visible`, an outline so nothing moves.

Motion uses 120, 180, 240 and 300 ms (`--duration-fast`, `-base`, `-slow`, `-sheet`) on `ease-standard` for change in place, `ease-enter` for arrivals and `ease-exit` for departures, exits shorter than entries. Sheets, modals, toasts, menus, row inserts and the switch thumb move. Money never counts up, tables never animate on sort, skeletons hold still, nothing bounces. Reduced motion removes every transform and transition.

## Status and icons

Icons come from `lucide-react` (ISC) at a 1.75 stroke (2 at 14 px), sized by the text beside them: 14 with `caption`, 16 with `label` and `body-sm`, 20 with `body` and `headline`, 24 in the bottom nav and empty states.

Every status is a badge with an icon, a word and its tone, on its `-bg`: paid `circle-check` (success), due soon `clock` (warning), overdue `triangle-alert` (danger), empty `circle-dashed` (neutral), draft `pencil-line` (info), ended `archive` (neutral). Esta's extra status, not yet due, takes `calendar` in neutral so its silhouette differs from due. The silhouettes differ, so status reads in grayscale and sunlight.

## Imagery and brand

Photos are brand and demo imagery only, in `apps/web/src/photos/` with `ATTRIBUTION.md` beside them (all Pexels License), rendered through `next/image` with explicit `sizes`.

The logo is the ESTA wordmark with a small blue square at the top right of the A, like the seal stamped on a land document; the app icon is the E with the same square on a blue tile. The marks are the outlined files in `docs/design/redesign-2026-11/brand/`, used exactly and never redrawn. `pnpm icons:build` draws `icon.svg`, the 180 px apple-touch icon and the 192, 512 and maskable 512 px manifest icons from `esta-app-icon.svg`.

## Do's and Don'ts

### Do:

- **Do** set every colour from a role token, and add a new pairing to `text-pairs.ts` before it ships.
- **Do** keep one primary button per view, last in its row.
- **Do** show status as icon, word and tone, in a badge on its `-bg`.
- **Do** read the theme from the `esta_theme` cookie on the server, so the first byte is already in the right theme.
- **Do** run `pnpm tokens:build` after editing `tokens.ts` and commit the generated `tokens.css`.

### Don't:

- **Don't** use pure black, gradient washes, glass or neon. White is for cards and inputs only.
- **Don't** nest cards or put icon tiles above headings.
- **Don't** set muted text on a coloured fill.
- **Don't** use the accent as a status, a chart series for money, or decoration.
- **Don't** show a button, search field or bell for a feature that does not exist yet.
- **Don't** use uppercase letter-spaced labels, centred body text, hover-only actions, or icon-only buttons on a phone.
- **Don't** use emoji, sparkle or magic-wand icons for the assistant.
