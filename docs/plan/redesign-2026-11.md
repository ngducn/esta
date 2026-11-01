# Redesign 2026-11: the calm blue workbench

Ryan redesigned Esta and asked on 2026-11-01 for the UI revamp to be built ("i redesigned Esta, please implement the UI revamp"). The source of truth is his design system artifact, https://claude.ai/artifact/8USdYGBumJc9AuaMsQfZKg (title `Esta`, last change 2026-11-01 by Ryan). The first PR copies it into `docs/design/redesign-2026-11/` for the record.

It replaces the 2026-10-16 look (lacquer red, house mark) with two layers on one palette:

- **The app is a workbench.** Inter only, hairlines, 8px controls, Esta blue `#1b5bda` only for the one primary action, selection and the current page. Every working screen follows one pattern: page head, summary strip, filter bar, data with its total.
- **The brand layer** (sign-in, sign-up, onboarding) uses Inter Display Light, split headlines, spaced capitals and pill buttons. None of it appears inside the app.

## Decisions taken as defaults

Ryan can overrule any of these in a sentence.

1. **Accent is Esta blue**, the same fill in both themes, with a lighter `accent-text` for links and the current nav item in dark. Danger keeps red. The accent was never a SPEC §3 lock; the 2026-10-16 lacquer red was an agent default.
2. **Token names follow the design system's role names** (`bg`, `surface`, `surface-raised`, `text`, `text-secondary`, `text-muted`, `border`, `border-field`, `accent-text`, `success-*`, `warning-*`, `danger-*`, `info-*`, `neutral-*` …). A codemod renames the 1,610 uses in 194 files, so code and design speak one vocabulary. Most uses change meaning anyway: `text-accent` splits into fill and text, and `overdue` becomes `danger` because errors use it too.
3. **Density is Thoáng and Gọn**, set by component variables (control height 48/40, row 64/44, card padding 24/16). Gọn never shrinks type or a touch target. It replaces today's 3px spacing unit.
4. **The ESTA wordmark with its blue seal** replaces the house mark; the app icon is the E tile.
5. **Every status is an icon, a word and a colour** (Lucide `circle-check`, `clock`, `triangle-alert`, `circle-dashed`, `pencil-line`, `archive`). It replaces the status shapes.
6. **The shell**: a bottom tab bar under 840px, an icon rail from 840px, the full 256px sidebar from 1080px. Text size, theme, density and language move into the account menu and apply on tap.
7. **Voice rewrites** land with the screen they belong to (Cài đặt in RD-5, Trợ lý in RD-4, splitting a leased house in RD-5).

## Slice matrix

Rows are slices in delivery order. Columns are the shared capabilities. A cell says what the slice adds.

| Slice | Tokens and type | Brand | Primitives | Status and money | Shell | Data display | Forms | Brand layer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RD-1 Every screen turns calm blue in the new shell | All role tokens, type styles, radii, shadows, motion, density vars, contrast pairs; codemod | Wordmark, app icons, favicon, manifest | Button, field, select, checkbox, radio, switch, card, dialog, sheet, toast, skeleton, empty state, avatar | `es-badge` grammar, `es-num` | Tab bar, rail, sidebar, page header, account menu with Mật độ | | | |
| RD-2 Tài sản reads as a workbench | | | | Completeness | | Summary strip, filter tabs, property card, property grid | | |
| RD-3 Thu tiền board and recording a payment | | | Sheet footer states | Signed, unknown, zero | | Data table with phone list, totals, bulk bar | Money input with `=` and words | |
| RD-4 Tổng quan and the Trợ lý thread | | | | | | Stat card, meter | | |
| RD-5 Property tabs, documents, reports, Cài đặt, wizard | | | Inline confirm | | | Address block | Date input with weekday, selection card, textarea | |
| RD-6 Sign-in, sign-up and onboarding | Inter Display | Reversed logo | Pill button | | | | | Split headline, eyebrow, frame, panel, line patterns |

## PR list

| Id | User outcome | Proof |
| --- | --- | --- |
| RD-1 | Mẹ opens any screen and sees the new blue look, the ESTA wordmark and the new tab bar or sidebar; she sets Gọn from the account menu | Full e2e and north-star, contrast and glyph checks, axe, verify screenshots at 390 and 1440 in light and dark, 130% tab bar |
| RD-2 | Mẹ finds a house by its photo on Tài sản and filters to the ones that need attention | e2e for filters, verify screenshots |
| RD-3 | Mẹ sees who has paid this month with a total, and records a payment from a phone sheet that confirms `= 3.500.000 ₫` in words | e2e record-payment flow, verify screenshots, money rules |
| RD-4 | Mẹ reads this month's figures on Tổng quan and talks with Trợ lý in the new thread look | e2e, verify screenshots |
| RD-5 | Every remaining working screen follows the workbench pattern and the voice guide | e2e for touched flows, verify screenshots |
| RD-6 | Mẹ signs in on a page that introduces Esta with its brand voice | e2e sign-in, Lighthouse on `/sign-in`, verify screenshots |

RD-1 may split its shell into RD-1b when product code passes about 800 added lines. RD-6 touches only the auth pages, so it can run beside RD-2.

## Order and gates

RD-1 first: it carries the blast radius. Then RD-2 and RD-6 side by side, then RD-3, RD-4 and RD-5. Each PR is reviewed and merged under the 2026-10-30 standing orders. The prototype-first rule is met by Ryan's artifact.
