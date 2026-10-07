---
name: Esta
description: A private ledger for a Vietnamese family's land and houses.
colors:
  paper: "oklch(98.5% 0.006 85)"
  surface: "oklch(99.6% 0.003 85)"
  ink: "oklch(24% 0.02 60)"
  ink-muted: "oklch(48% 0.015 60)"
  rule: "oklch(90% 0.01 80)"
  lacquer: "oklch(42% 0.11 35)"
  paid: "oklch(52% 0.09 165)"
  due: "oklch(64% 0.13 75)"
  overdue: "oklch(56% 0.19 28)"
  vacant: "oklch(60% 0.03 250)"
  paid-ink: "oklch(44% 0.08 165)"
  due-ink: "oklch(46% 0.09 75)"
  overdue-ink: "oklch(48% 0.17 28)"
  vacant-ink: "oklch(46% 0.03 250)"
  paper-dark: "oklch(19% 0.01 60)"
  surface-dark: "oklch(23% 0.011 60)"
  ink-dark: "oklch(93% 0.012 80)"
  ink-muted-dark: "oklch(74% 0.012 70)"
  rule-dark: "oklch(33% 0.01 60)"
  lacquer-dark: "oklch(70% 0.1 35)"
  paid-dark: "oklch(68% 0.1 165)"
  due-dark: "oklch(76% 0.13 75)"
  overdue-dark: "oklch(66% 0.17 28)"
  vacant-dark: "oklch(66% 0.03 250)"
  paid-ink-dark: "oklch(80% 0.09 165)"
  due-ink-dark: "oklch(84% 0.11 75)"
  overdue-ink-dark: "oklch(78% 0.12 28)"
  vacant-ink-dark: "oklch(80% 0.025 250)"
typography:
  hero-xl:
    fontFamily: "Source Serif 4"
    fontSize: "3.5rem"
    fontWeight: 600
    lineHeight: 1.3
    fontFeature: "'tnum', 'lnum'"
  hero:
    fontFamily: "Source Serif 4"
    fontSize: "2.75rem"
    fontWeight: 600
    lineHeight: 1.3
    fontFeature: "'tnum', 'lnum'"
  h1:
    fontFamily: "Source Serif 4"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.3
  h2:
    fontFamily: "Source Serif 4"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.3
  h3:
    fontFamily: "Source Sans 3"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.35
  lead:
    fontFamily: "Source Sans 3"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.45
  body:
    fontFamily: "Source Sans 3"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  small:
    fontFamily: "Source Sans 3"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.45
  meta:
    fontFamily: "Source Sans 3"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.45
spacing:
  unit: "0.25rem"
  touch: "2.75rem"
---

# Design System: Esta

## Overview

**Creative North Star: "Lacquer and Ledger"**

Esta looks like a well-kept paper ledger set beside a piece of Vietnamese lacquerware (sơn mài). Warm paper, deep ink, one restrained lacquer red, generous margins. Type, rule lines and whitespace carry the structure that boxes and shadows carry in a SaaS dashboard. The reference is a private bank statement.

Numbers are the hero. Amounts sit large in the figure face with tabular lining digits, right-aligned, never squeezed. Status is a shape, then a word, then a color, in that order, so it reads in bright sun on a cheap phone and for a reader who cannot tell jade from slate. Motion confirms an action and never decorates.

The primary reader is an older, non-technical owner on her phone in outdoor light, in Vietnamese. Every token is chosen for that reader first: 16 px body at the smallest, a user text scale of 100, 115 and 130 percent, 44 px touch targets, and contrast proven by script.

**Key Characteristics:**

- Ink on paper on most screens. One accent, used rarely.
- A serif for figures and page titles, a sans for everything else.
- Hairline rules instead of cards. No card inside a card, no shadow stacks.
- Status as shape plus word plus color.
- Light and dark themes from one token source, chosen per member and rendered by the server.

## Colors

Warm, low-chroma neutrals at hue 60 to 85, one lacquer red, and four status hues. Every value is OKLCH. The source of truth is `apps/web/src/design/tokens.ts`, and `pnpm tokens:build` writes `apps/web/src/styles/tokens.css` from it. The `-dark` keys above are the same tokens under `[data-theme="dark"]`.

### Primary

- **Lacquer** (`lacquer`): the brand mark, the active navigation marker and rare emphasis. It is never a status color and never a button fill.

### Neutral

- **Paper** (`paper`): the page background, a warm off-white in light and a warm near-black in dark.
- **Surface** (`surface`): raised areas such as sheets. In light mode it sits about one percent of lightness off paper, too close to read as a separate plane in sunlight, so a surface always carries a `rule` hairline or the sheet shadow. Never a card stack.
- **Ink** (`ink`): text and primary buttons.
- **Ink Muted** (`ink-muted`): secondary text on paper or surface only, never on a colored fill.
- **Rule** (`rule`): hairlines and dividers. Decorative, so it carries no contrast requirement.

### Status

- **Jade** (`paid`, check shape), **Ochre** (`due`, clock shape), **Vermilion** (`overdue`, filled diamond with the day count), **Slate** (`vacant`, open square). These draw shapes, fills and borders at 3:1 or more.
- **Status ink** (`paid-ink`, `due-ink`, `overdue-ink`, `vacant-ink`): the same hue at a lightness that reaches 4.5:1 for the status word. A status word is always set in its `-ink` token, never in the shape color.

### Named Rules

**The Proven Pair Rule.** Every foreground and background pair the UI draws is listed in `apps/web/src/design/text-pairs.ts`. `pnpm contrast:check` (part of `pnpm check`) measures each in both themes, text at 4.5:1 and status shapes at 3:1, and fails on any miss, on any token outside sRGB, and on any token that renders as pure black or pure white. Add the pair before you ship it.

**The One Accent Rule.** Lacquer appears on a small fraction of any screen. Primary buttons are ink, not accent.

## Typography

**Figure and display font:** Source Serif 4 (variable, weights 400 to 600, optical sizes 20 to 60), with a metric-matched Times New Roman fallback.
**UI font:** Source Sans 3 (variable, weights 400 to 600), with a metric-matched Arial fallback.

**Character:** the serif carries the personality and the numbers. The sans is plain and steady. Both come from the same Adobe lineage, so x-heights and color match at body size.

Both are SIL OFL 1.1, self-hosted from `apps/web/src/fonts/` through `next/font/local`, and built by `pnpm fonts:build` from google/fonts commit `7085eb89`. The subset keeps basic Latin, the Latin-1 letters Vietnamese uses, the Vietnamese block, ₫ and common punctuation, plus the text layout features and, for the serif, the figure features. A letter outside that set, such as ü in a foreign name, falls back glyph by glyph to the metric-matched fallback. The sans is 20 KB and preloaded. The serif is 49 KB, loads with `font-display: swap` when a page first uses it, and is kept off `/sign-in`, whose title is set in the sans so the sign-in page stays within its LCP budget.

### Why these two

Spike S2 tested Be Vietnam Pro, Public Sans and Source Sans 3 for the UI, and Newsreader, Source Serif 4 and Fraunces for figures, with a coverage script over the glyph test string at every weight.

- Every candidate covers all 68 code points of the glyph test string.
- **Be Vietnam Pro failed** the tabular figures check. Its digits are proportional (the "1" is about half the width of the "0") and it has no `tnum` feature, so amounts would not line up in a column.
- **Fraunces failed** the same check. The Google Fonts build has no `tnum` or `lnum`.
- **Newsreader and Public Sans passed** but lost on look. Newsreader has no `lnum` feature, so lining digits are only its default. Public Sans digits run wide and loose next to the serif in a date column.
- **Source Sans 3** is tabular by default. **Source Serif 4** has explicit `tnum` and `lnum` plus an optical size axis, and "3.500.000 ₫" and "Đặng Thị Hường" set cleanly at 32 px with no mark collisions at line height 1.3.

### Hierarchy

- **Hero figures** (Source Serif 4, 600, 2.75rem and 3.5rem, 1.3): the one or two amounts a screen exists to show.
- **Page title** (Source Serif 4, 600, 2.25rem `h1` and 1.75rem `h2`, 1.3): page and section titles.
- **Title** (Source Sans 3, 600, 1.375rem, 1.35): group headings inside a page.
- **Lead** (Source Sans 3, 400, 1.125rem, 1.45): an introductory sentence, table amounts on desktop.
- **Body** (Source Sans 3, 400, 1rem, 1.5): all running text. 16 px at text scale 1, never smaller.
- **Small** (Source Sans 3, 400, 0.9375rem, 1.45): secondary lines and dense tables. The compact density floor.
- **Meta** (Source Sans 3, 400, 0.8125rem, 1.45): timestamps and captions only, never an action label.

### Named Rules

**The Figures Rule.** Amounts use the figure face with the `figures` utility (`font-variant-numeric: lining-nums tabular-nums`) and sit right-aligned in tables. `1.111.111 ₫` and `8.888.888 ₫` render at the same width, and `e2e/dev-glyphs.spec.ts` asserts it.

**The Full Coverage Rule.** `pnpm glyphs:check` (part of `pnpm check`) reads every shipped font file at every weight in `typefaces`, and at the smallest and largest type size on an optical size axis. It fails on a missing code point, on a missing `tnum` or `lnum` for the figure face, and on a font file the tokens do not name.

**The Leading Rule.** Line height stays at 1.3 or more, so Vietnamese stacked marks (ặ, ữ, ỡ, Ướ) clear the line above. Tailwind's own `leading-*` scale is replaced by `leading-tight` (1.3), `leading-snug` (1.35), `leading-normal` (1.45) and `leading-relaxed` (1.5), and `pnpm check` fails on any token below 1.3.

**The Self-Hosted Rule.** Never Inter, Arial, Roboto or a system face as the identity face, and never a font CDN.

## Layout

Spacing steps are multiples of a 4 px unit (`p-4` is 16 px), and `min-h-touch` is the 44 px minimum target. All sizes are in rem off a root of `100% × --text-scale`, so the member's 115 and 130 percent text scale grows type and spacing together.

Desktop has a 240 px left sidebar and content up to 1200 px; tables are first-class. Mobile has a bottom tab bar with five items, and tables become stacked rows with the amount on the right. Comfortable density is the default; compact tightens rows and padding without taking type below 15 px. The app shell lands in P0-14.

## Elevation & Depth

Flat. Depth comes from tone (surface on paper) and from rule lines, not from shadows. Sheets that slide up on mobile are the one raised element, and their shadow lands with the base components in P0-12.

Motion uses 150, 180 and 220 ms (`--duration-fast`, `--duration-base`, `--duration-slow`) on `cubic-bezier(0.2, 0, 0, 1)`, for sheet entry, list insertions, the undo toast and a number changing after a payment. Reduced motion turns every transition off.

## Shapes

Status shapes are drawn SVG at a 2.25 stroke on a 24 unit grid: a check for paid, a clock for due, a filled diamond for overdue, and an open square for vacant. They are never Unicode glyphs or emoji. Radius and border language for controls lands in P0-12.

## Do's and Don'ts

### Do:

- **Do** set every color from a token (`bg-paper`, `text-ink`, `var(--due-ink)`), and add a new pairing to `text-pairs.ts` before it ships.
- **Do** put amounts in Source Serif 4 with `figures`, right-aligned.
- **Do** show status as shape, word in its `-ink` token, then color.
- **Do** read the theme from the `esta_theme` cookie on the server, so the first byte is already in the right theme.
- **Do** run `pnpm tokens:build` after editing `tokens.ts` and commit the generated `tokens.css`.

### Don't:

- **Don't** use pure black, pure white, gradients, glass or neon.
- **Don't** nest cards, stack shadows, or put icon tiles above headings.
- **Don't** set gray text on a colored background, or a status word in its shape color.
- **Don't** use more than one accent, or lacquer as a status.
- **Don't** use uppercase letter-spaced labels, centered body text, hover-only actions, or icon-only buttons on mobile.
- **Don't** use emoji, sparkle or magic-wand icons for the assistant.
