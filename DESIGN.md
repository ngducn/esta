---
name: Esta
description: A private, bright app for a Vietnamese family's land, houses and rent.
colors:
  ground: "oklch(97.3% 0.003 265)"
  surface: "oklch(99.5% 0.002 265)"
  surface-2: "oklch(98.2% 0.003 265)"
  ink: "oklch(20.9% 0.01 268)"
  ink-2: "oklch(30.5% 0.021 266)"
  ink-muted: "oklch(49.3% 0.025 268)"
  rule: "oklch(93.4% 0.007 269)"
  rule-strong: "oklch(90.3% 0.009 265)"
  field: "oklch(62% 0.022 265)"
  accent: "oklch(53% 0.166 32)"
  accent-pressed: "oklch(47% 0.166 32)"
  accent-tint: "oklch(95% 0.014 28)"
  on-accent: "oklch(99% 0.004 32)"
  paid: "oklch(46.9% 0.112 153)"
  due: "oklch(47.9% 0.111 59)"
  overdue: "oklch(48.5% 0.165 30)"
  vacant: "oklch(43.2% 0.038 267)"
  paid-fill: "oklch(96.8% 0.016 161)"
  due-fill: "oklch(97.2% 0.022 80)"
  overdue-fill: "oklch(96% 0.017 27)"
  vacant-fill: "oklch(96% 0.005 258)"
  ground-dark: "oklch(16% 0.008 265)"
  surface-dark: "oklch(20.5% 0.01 265)"
  surface-2-dark: "oklch(23.5% 0.011 265)"
  ink-dark: "oklch(94% 0.006 265)"
  ink-2-dark: "oklch(87% 0.01 265)"
  ink-muted-dark: "oklch(74% 0.018 265)"
  rule-dark: "oklch(29% 0.012 265)"
  rule-strong-dark: "oklch(36% 0.014 265)"
  field-dark: "oklch(56% 0.02 265)"
  accent-dark: "oklch(72% 0.14 32)"
  accent-pressed-dark: "oklch(66% 0.14 32)"
  accent-tint-dark: "oklch(27% 0.04 30)"
  on-accent-dark: "oklch(18% 0.02 30)"
  paid-dark: "oklch(80% 0.12 155)"
  due-dark: "oklch(83% 0.12 75)"
  overdue-dark: "oklch(78% 0.12 28)"
  vacant-dark: "oklch(81% 0.025 265)"
  paid-fill-dark: "oklch(27% 0.04 155)"
  due-fill-dark: "oklch(28% 0.04 70)"
  overdue-fill-dark: "oklch(27% 0.05 28)"
  vacant-fill-dark: "oklch(27% 0.012 265)"
typography:
  hero-xl:
    fontFamily: "Inter"
    fontSize: "2.75rem"
    fontWeight: 600
    lineHeight: 1.3
    fontFeature: "'tnum'"
  hero:
    fontFamily: "Inter"
    fontSize: "2.125rem"
    fontWeight: 600
    lineHeight: 1.3
    fontFeature: "'tnum'"
  h1:
    fontFamily: "Inter"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.3
  h2:
    fontFamily: "Inter"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.3
  h3:
    fontFamily: "Inter"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.35
  lead:
    fontFamily: "Inter"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.45
  body:
    fontFamily: "Inter"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  small:
    fontFamily: "Inter"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.45
  meta:
    fontFamily: "Inter"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  xs: "0.375rem"
  sm: "0.625rem"
  md: "0.75rem"
  lg: "1rem"
spacing:
  unit: "0.25rem"
  touch: "2.75rem"
---

# Design System: Esta

## Overview

**Creative North Star: "Bright and Calm"**

Esta looks like a well-run banking app crossed with a clean property listing. A cool light-gray ground, white cards with a hairline border and one soft shadow, one lacquer-red accent, one sans typeface, line icons beside every label, and real photos of the places. The operator approved this direction on 2026-10-16; the mock lives in `docs/design/redesign-2026-10/`.

The primary reader is an older, non-technical owner on her phone in daylight, in Vietnamese, often at text scale 115 or 130%. Every token is chosen for her first: 16 px body at the smallest, 44 px touch targets, status as shape plus word plus color, and contrast proven by script. Each screen opens on the question she asks most often (`docs/plan/trail/ux-daily-use.md`).

**Key Characteristics:**

- White cards on a gray ground. No card inside a card.
- One accent for the primary action, the active navigation item and the brand mark.
- Icons beside labels, never instead of them on mobile.
- Photos for places, initials for people.
- Light by default whatever the device says; dark only when the member chooses it.

## Colors

Cool neutrals at hue 265, one lacquer red, and four status pairs. Every value is OKLCH. The source of truth is `apps/web/src/design/tokens.ts`, and `pnpm tokens:build` writes `apps/web/src/styles/tokens.css` from it. The `-dark` keys above are the same tokens under `[data-theme="dark"]`, which the server sets from the `esta_theme` cookie. No `prefers-color-scheme` rule exists, so a phone set to dark still opens Esta light.

### Primary

- **Accent** (`accent`, `#B83A26` in light): the primary button fill, the active navigation item (on `accent-tint`), the brand mark, the focus ring and the text caret. Text on an accent fill uses `on-accent`. Pressed, the fill turns to `accent-pressed` (`#A3250F` in light), because a translucent press state would drop `on-accent` below 4.5:1. Never a status color.

### Neutral

- **Ground** (`ground`, `#F5F6F8`): the page background.
- **Surface** (`surface`, `#FDFDFF`): cards, sheets, the sidebar, inputs. The mock's pure white ships one step off white, because pure white is banned.
- **Surface 2** (`surface-2`, `#F8F9FB`): table headers and quiet blocks inside a card.
- **Ink** (`ink`, `#16181D`): text and the secondary (dark) button. **Ink 2** (`ink-2`) sets running text in notes.
- **Ink Muted** (`ink-muted`, `#5B6170`): secondary text on a ground, never on a colored fill.
- **Rule** (`rule`, `#E7E9EE`): card borders and dividers. **Rule Strong** (`rule-strong`, `#DCDFE5`): outline button borders. Both are decorative; the button's text label carries it.
- **Field** (`field`, `#808694`): input and checkbox borders, darker than the mock's rule so a field edge reaches 3:1 (WCAG 1.4.11).

### Status

- **Paid** (`paid` on `paid-fill`, check shape), **Due** (`due` on `due-fill`, clock shape), **Overdue** (`overdue` on `overdue-fill`, filled diamond with the day count), **Vacant** (`vacant` on `vacant-fill`, open square). Each status color reaches 4.5:1 on its fill and on every ground, so one token draws both the shape and the word.

### Named Rules

**The Proven Pair Rule.** Every foreground and background pair the UI draws is listed in `apps/web/src/design/text-pairs.ts`. `pnpm contrast:check` (part of `pnpm check`) measures each in both themes, text at 4.5:1 and field borders at 3:1, and fails on any miss, on any token outside sRGB, on any token that renders as pure black or pure white, and on any `text-*` and `bg-*` pair the source draws that the list leaves out.

**The One Accent Rule.** The accent marks the one primary action on a screen and where you are. Secondary actions are ink or outline.

## Typography

**Font:** Inter (variable, weights 400 to 600, optical size 14 to 32), with a metric-matched Arial fallback.

SIL OFL 1.1, self-hosted from `apps/web/src/fonts/` through `next/font/local` and built by `pnpm fonts:build` from google/fonts commit `7085eb89`. The subset keeps basic Latin, the Latin-1 letters Vietnamese uses, the Vietnamese block, ₫ and common punctuation, plus the text layout features and `tnum`. The file is 39 KB (the optical size axis doubles it) and preloaded. A letter outside the subset, such as ü in a foreign name, falls back glyph by glyph. The browser's automatic optical sizing draws the tighter display cut at heading sizes.

### Why this face

Ryan's decision, 2026-10-24: "make it a bit cleaner with Geist font or something, the bold nature typography kinda makes the whole thing heavy to look at." Plus Jakarta Sans at 700 is retired. Geist was tried first and fails the Full Coverage Rule: it has no ₫ (U+20AB), so every amount would draw its currency sign from the fallback font. Inter is the closest clean neo-grotesk that passes. `pnpm glyphs:check` reads all 176 code points of the glyph test string and the Vietnamese letters at 400, 500 and 600, each at optical size 14 and 32, with a `tnum` feature and uniform digit widths. Candidates checked on 2026-10-24 against the same pinned commit: Geist (no ₫), Be Vietnam Pro (no `tnum`, no arrows), Public Sans (no arrow glyph), Onest (no ₫), DM Sans, Albert Sans, Figtree, Instrument Sans and Schibsted Grotesk (no Vietnamese horn letters), Manrope (passes, but geometric and wide). Source Sans 3 and Source Serif 4 from spike S2 stay retired.

### Hierarchy

- **Summary figures** (600, 2.125rem `hero` and 2.75rem `hero-xl`, 1.3, `figures`): the one figure a card exists to show, in the compact money form.
- **Page title** (600, 1.875rem `h1` on desktop and 1.5rem `h2` on phones, -0.02em tracking).
- **Group title** (600, 1.25rem `h3`), **card title** (600, 1.125rem `lead`).
- **Labels, buttons and list amounts** (500, at `small`, `body` or `lead` size): the one step above body, so a label reads without shouting.
- **Body** (400, 1rem, 1.5): all running text. 16 px at text scale 1, never smaller.
- **Small** (400, 0.9375rem, 1.45): secondary lines, labels, dense tables. The floor for any visible text, in either density.
- **Meta** (400, 0.8125rem, 1.45): reserved for developer pages; the app keeps text at 15 px or more.

### Named Rules

**The Figures Rule.** Amounts use the `figures` utility (`font-variant-numeric: lining-nums tabular-nums` with `tnum`) and sit right-aligned in tables. `1.111.111 ₫` and `8.888.888 ₫` render at the same width, and `e2e/dev-glyphs.spec.ts` asserts it. Summary cards show `formatVndCompact` ("29 tr"); tables, forms, receipts and QR sheets show the exact amount.

**The Full Coverage Rule.** `pnpm glyphs:check` (part of `pnpm check`) reads every shipped font file at every weight in `typefaces`. It fails on a missing code point, on a missing `tnum`, and on a font file the tokens do not name.

**The Leading Rule.** Line height stays at 1.3 or more, so Vietnamese stacked marks (ặ, ữ, ỡ, Ướ) clear the line above, and `pnpm check` fails on any token below 1.3.

**The Weight Ceiling Rule.** Nothing is heavier than 600. The Tailwind weights are `font-normal`, `font-medium` and `font-semibold`; there is no `font-bold`, and `apps/web/src/app/globals-css.test.ts` fails if one comes back. Body is 400, labels, buttons and list amounts 500, headings and the one summary figure of a card 600.

**The Self-Hosted Rule.** Never Arial, Roboto or a system face as the identity face, and never a font CDN. Inter is self-hosted and chosen by Ryan (2026-10-24).

## Layout

Spacing steps are multiples of a 4 px unit (`p-4` is 16 px), and `min-h-touch` is the 44 px minimum target. All sizes are in rem off a root of `100% × --text-scale`, so the member's 115 and 130 percent text scale grows type and spacing together.

Desktop has a 240 px white sidebar (brand mark, household, the five sections with icons, a "Khác" group with Báo cáo and Cài đặt, the member block) and content up to 1200 px on the ground. Mobile has a header with the date and the account button and a bottom tab bar of five icon-and-label items. Comfortable density is the default; compact tightens rows and padding without taking type below 15 px.

A section with no feature yet shows one card: an icon beside the title, one sentence on what the section will do, and the one action that works today. Never a button, search field or bell for a feature that does not exist.

## Elevation & Depth

Cards are `surface` on `ground` with a 1 px `rule` border and `shadow-card` (two soft offset layers at 4 to 5% of a cool ink). Sheets and the account menu use `shadow-sheet`. Shadows use a fixed cool ink, so they stay soft in dark mode.

Motion uses 150, 180 and 220 ms (`--duration-fast`, `--duration-base`, `--duration-slow`) on `cubic-bezier(0.2, 0, 0, 1)`, for sheet entry, list insertions, the undo toast and a number changing after a payment. Reduced motion turns every transition off.

## Shapes

Radii: `rounded-xs` 6 px (checkbox box), `rounded-sm` 10 px (buttons, nav items), `rounded-md` 12 px (inputs, icon tiles), `rounded-lg` 16 px (cards, sheets), `rounded-full` (pills, avatars).

Icons come from `lucide-react` (ISC), imported by name, at 20 px in navigation and buttons with a 1.75 to 2 stroke. Status shapes are drawn SVG at a 2.25 stroke on a 24 unit grid: a check for paid, a clock for due, a filled diamond for overdue, an open square for vacant. Never Unicode glyphs or emoji.

## Imagery

Photos are brand and demo imagery only, in `apps/web/src/photos/` with `ATTRIBUTION.md` beside them (all Pexels License). They render through `next/image` from static imports with explicit `sizes`. The sign-in hero shows on desktop only. Its img is lazy and `ReactDOM.preload` requests it at high priority under `(min-width: 64rem)`, so a desktop fetches it early and a phone never fetches it, which keeps the form the LCP element there. Property photos as data arrive with properties in P1-04 and P1-05. The app icon is the brand mark (a white house on a lacquer-red rounded square). `pnpm icons:build` draws `icon.svg`, the 180 px apple-touch icon and the 192, 512 and maskable 512 px manifest icons from the one path in `apps/web/src/design/brand.ts`.

## Do's and Don'ts

### Do:

- **Do** set every color from a token (`bg-surface`, `text-ink`, `var(--due)`), and add a new pairing to `text-pairs.ts` before it ships.
- **Do** wrap content in a card on the ground, with structure inside from rules and spacing.
- **Do** put an icon beside every navigation item and primary action, with its text label.
- **Do** show status as shape, word, then color, in a pill on its `-fill`.
- **Do** read the theme from the `esta_theme` cookie on the server, so the first byte is already in the right theme.
- **Do** run `pnpm tokens:build` after editing `tokens.ts` and commit the generated `tokens.css`.

### Don't:

- **Don't** use pure black, pure white, gradient washes, glass or neon.
- **Don't** nest cards or put icon tiles above headings.
- **Don't** set gray text on a colored background.
- **Don't** use more than one accent, or the accent as a status.
- **Don't** show a button, search field or bell for a feature that does not exist yet.
- **Don't** use uppercase letter-spaced labels, centered body text, hover-only actions, or icon-only buttons on mobile.
- **Don't** use emoji, sparkle or magic-wand icons for the assistant.
