Copied on 2026-11-01 from Ryan's design system artifact, https://claude.ai/artifact/8USdYGBumJc9AuaMsQfZKg. That artifact is the source of truth; this copy is the offline record.

Esta is a shared ledger, *sổ cái nhà đất của gia đình*, for Vietnamese families who own and rent out property: houses and title documents, rent per room, who has paid and who is late, contracts, and an assistant called Trợ lý. The primary reader is a parent in their 50s or 60s on a mid-range Android phone at 115–130% text size, in Vietnamese, often outdoors. Adult children help on desktop. Every decision below is made for that parent first.

The feel is a mature, well-funded company's product: calm, exact, trustworthy, and conventional on purpose. It should sit comfortably beside a bank app on Mẹ's phone. Discipline from Stripe (type), Linear (craft) and Mercury (trust); none of their surfaces copied. Warmth comes from the words and the family's own photos, not from the palette. No decorative gradients, no glass, no trend effects.

## Two layers, one palette

- **The app is a workbench.** People open Esta to check numbers and get something done, so every working screen is simple, aligned and quiet: Inter only, hairlines for structure, 8px-radius controls, blue only for the one primary action, selection and the current page. Premium comes from build quality: tabular figures, totals that add up, real empty and loading states, nothing decorative. Every screen follows the *Workbench* pattern: page head, summary strip, filter bar, data with its total.
- **The brand layer has a voice.** Where Esta introduces itself (website, onboarding, sign-in, emails, printed report covers) it uses Inter Display Light at large sizes, split headlines with ruled lines, spaced capitals, double-ruled frames, wayfinding rows, fine line patterns and pill buttons, in the spirit of Vietnamese hospitality brands. See *Brand layer*. None of it appears inside the app.

Both layers use the same tokens: ink, white, a cool light grey and Esta blue.

## What changed from the prototype, and why

| Problem in the prototype | Decision | Why, in one line |
| --- | --- | --- |
| The brand red was also the overdue red | Accent moves to **Esta blue** (`accent` `#1b5bda`, OKLCH hue 262). Danger keeps red. | Blue is the colour people already trust with money (banks, VietQR, payment apps), it sits 125° from danger red, and it never reads as a warning. |
| Primary buttons carried warning weight everywhere | **One primary per view**; everything else `secondary` or `ghost`. Destructive red only on the confirming step. | A screen of blue and outline buttons reads as calm; red appears only when something is about to end. |
| Dark mode was an inversion; the accent changed hue | Neutrals tuned separately per theme; `accent` is the **same hex in both themes** (`#1b5bda`), with `on-accent` ≥ 4.5:1 on it, and `accent-text` lightens only for text. | Hue held in OKLCH plus one shared fill means the button Mẹ learned in light is the button she sees in dark. |
| Flat type hierarchy; money without tabular figures | Five title steps (40 / 30 / 24 / 20 / 18) at weight 600 with tightening tracking over 400 body; `tabular-nums` on `body` and the `.es-num` utility on every amount. | Size, weight and colour now each carry a step; digits line up in every column and never jump when a value changes. |
| Selection cards signalled selection twice | **One signal**: the indicator fills (empty ring → blue disc with a check). Border and background do not change. | A shape change survives sunlight, grayscale and colour blindness; a second signal only adds weight. |
| Badges mixed dots, diamonds and icons | Every status is **icon + word + colour**, always a Lucide icon at `icon-xs`/`icon-sm`, never a dot. | One grammar for six statuses; the icon silhouette alone tells paid (check) from overdue (triangle). |

## Rules a consuming agent follows

**Colour.** Build with role tokens only (`bg`, `surface`, `text`, `text-secondary`, `border`, `accent`, `success-text` …); the `slate-*`, `blue-*`, `green-*`, `amber-*`, `red-*` ramps are reference. Page ground is `bg` (cool light grey); cards are white `surface` with a `border` hairline and `shadow-xs`; menus, sheets and modals are `surface-raised`. Body text is `text` (≥ 7:1 everywhere it sits). `text-muted` never sits on a coloured fill. Never pure black; white is for cards and inputs only.

**The accent.** `accent` fills the one primary button, checked controls and the brand mark. `accent-text` is for links and the current nav item. `accent-subtle` marks where you are (active nav, selected row). The accent fill is never a status, never a chart series for money in or out, never decoration. `info` shares the blue ramp because it is the one status that never asks for attention; it always appears as a tinted badge or banner with its icon and word, never as a solid button.

**Status.** `success` = paid, `warning` = due soon, `danger` = overdue, failed or destructive, `info` = draft, `neutral` = empty or ended. A status shows as `.es-badge` with its icon and word on its `-bg`; the word carries the meaning, the colour confirms it. Amounts stay `text`-coloured even when overdue: the badge says overdue, the number stays readable.

**Type.** In the app, one family: Inter, weights 400 / 500 / 600 only. Inter Display (300 and 500) is for the brand layer only, through the `brand-*` styles and `es-mk-*` classes. Use the app type styles by name: `display`, `title-1`, `title-2`, `title-3`, `headline`, `body`, `body-strong`, `label`, `body-sm`, `caption`, and for money `figure-xl`, `figure-lg`, `figure-md`, `amount`. Line height never below 1.3, so ặ, ỗ, Ở clear the line above. Sizes are rem: the member's text size (100 / 115 / 130%) scales type and spacing together.

**Money.** `Esta.formatVnd(3500000)` → `3.500.000 ₫` (no-break space before ₫). Exact amounts in tables, forms, receipts, QR sheets and anything Mẹ confirms. `Esta.formatVndCompact` → `42,5 tr`, `12,5 tỷ` only in summary figures and charts, with the exact amount one tap away. Numbers never truncate and never wrap. Full rules: *Money & data*.

**Space and shape.** 4px base (`space-1` = 4px … `space-20` = 80px). Radius: `radius-md` 8 for controls, `radius-lg` 12 for cards, `radius-xl` 16 for modals and property cards, `radius-full` for badges and avatars. Borders are 1px hairlines; shadows are soft and only add lift.

**Density.** Thoáng is the default. `data-density="gon"` on any container tightens control height (48 → 40), row height (64 → 44), card padding (24 → 16) and gaps. Gọn never shrinks type and never takes a touch target under 44px.

**Focus.** Every interactive element shows `focus-ring`: a 2px solid ring 2px outside, ≥ 3:1 on every surface in both themes. Never remove it; never replace it with a colour change.

**Motion.** 120 / 180 / 240 / 300 ms on `ease-standard`, `ease-enter`, `ease-exit`. Sheets, modals, toasts, menus, row inserts and the switch thumb move. Money never counts up, tables never animate on sort, nothing bounces. Under reduced motion everything becomes an instant change.

**Icons.** Lucide, 1.75 stroke (2 at 14px), sizes tied to the text beside them: 14 with caption, 16 with label and body-sm, 20 with body and headline, 24 in the bottom nav. An icon sits beside a word; on phones it never replaces one.

**Voice.** Natural, warm, concise Vietnamese, the way a capable niece explains things to her aunt. Say what happened and what to do next. No developer words, no roadmap language, no exclamation marks, no emoji. Full guide: *Voice*.

## Brand

The logo is the wordmark **ESTA** in spaced capitals (Inter Display Medium, tracked +22%) with a small blue square at the top right of the A, like the seal stamped on a land document. It is outlined in the files, so it never falls back to another face. The app icon is the **E** with the same square, on a blue or ink tile.

| File | Use |
| --- | --- |
| `esta-logo.svg` | Primary logo: ink letters, blue square. Light grounds: website, sign-in, documents, the app sidebar. |
| `esta-logo-reversed.svg` | White letters, light-blue square. Dark grounds, the blue panel, photos under a scrim. |
| `esta-logo-mono.svg` | All ink. Printed receipts, faxes, stamps, monochrome exports. |
| `esta-app-icon.svg` · `esta-app-icon-ink.svg` | The **E** and square on a blue tile (white square) or an ink tile (light-blue square), 22% corners. App icon, favicon, the collapsed sidebar rail. |

Proportions: the square is 24% of the cap height, set 0.05em from the A and aligned to the cap line. On the tile the **E** is 40% of the tile height. Clear space on every side is the cap height. Minimum size: wordmark 12px tall, app icon 16px. Inks are fixed: blue `#1b5bda`, light blue `#689cfe` (on dark only), ink `#15191f`, white. Never set the name in live text as a logo, drop or move the square, recolour it, or add effects.

## Using the files

- `tokens.json` holds every token; the page compiles it to `tokens.css` (`--bg`, `--space-4`, `--radius-lg`, `.body`, `.figure-lg` …), with `[data-theme="dark"]` overrides.
- `components/bundle.css` holds every component as plain CSS classes (`es-btn es-btn--primary`, `es-input`, `es-badge es-badge--overdue`, `es-table` …) and the density variables. Load it after `tokens.css`. Each component's page shows its markup and states; its README lists the classes and what the consumer provides.
- `components/bundle.js` defines `window.Esta`: `formatVnd`, `formatVndCompact`, `formatVndSigned`, `vndInWords`, `parseVnd` (the shorthand parser from `packages/core`, so `3tr5` → 3.500.000), `formatDate`, `formatDateLong`, `formatDayMonth`, `formatMonth`, `formatDateRange`, `formatRelativeDue`, `formatDueBadge`, `formatActivity`, `parseDate`, `moneyErrors` and `dateErrors` (the Vietnamese messages shown under a field), `icon(name, {size})`, `hydrate(root)` (turns `<i data-icon="house">` into the Lucide SVG) and `bind(root)` (wires money and date previews, table sort and row selection). No framework needed; React apps can use the same classes.
- Assets: `Brand` (the ESTA wordmark and the app icons; see *Brand* above), `Icons` (the 29 core Lucide glyphs as files), `Photos` (four Pexels demo photos for property cards).
- Mockups set `<html data-theme="light|dark">` and, optionally, `data-density="gon"`. Copy is Vietnamese; names and places in demo data contain "Demo".
