# Esta design brief

This brief is the input to `/impeccable init` (which writes `PRODUCT.md`) and to every `/impeccable shape` call. Sections 1 to 4 are durable product truth. Sections 5 onward are the visual and interaction direction that Phase 0 turns into tokens and that `/impeccable document` records in `DESIGN.md`.

The bar: someone opening Esta should assume a small, serious studio designed it for this family. Nothing should look like a template, a crypto dashboard, or an "AI app".

## 1. Product truth

Esta is the family's ledger for its land and houses. It replaces a drawer of certificates, a rent notebook, and a chat thread of bank screenshots. It must be exact about money, calm about problems, and fast for the three things people do most: see what needs doing today, record a payment, find a document.

## 2. Audience and operating context

| | Mẹ | Ryan |
| --- | --- | --- |
| Device | Phone first (installed PWA), sometimes a tablet | Laptop and phone |
| Language | Vietnamese only | Vietnamese and English |
| Comfort with apps | Uses Zalo and a banking app daily; avoids anything that looks technical | Engineer; wants density and shortcuts |
| When | Morning check, at a property collecting rent, evenings | Weekly review, imports, configuration |
| Fears | Recording the wrong amount, losing a document, pressing something irreversible | Wrong numbers, data loss, silent agent mistakes |

Context that shapes design: outdoor use in bright light at a rooming house; one-handed use while holding cash; patchy mobile data; tenants watching over her shoulder (sensitive data must not flash on screen).

## 3. Voice

Neutral, polite Vietnamese, like a careful family accountant. Short sentences. Plain words over legal or technical terms; when a legal term is unavoidable (thửa đất, tờ bản đồ) show it as people know it from the certificate.

| Situation | Write | Avoid |
| --- | --- | --- |
| Empty list | "Chưa có tài sản nào. Thêm tài sản đầu tiên bằng ảnh sổ hoặc nhập tay." | "Oops! Nothing here yet 🚀" |
| Status | "Quá hạn 12 ngày" | "Overdue!!!", red-only badges |
| Success with undo | "Đã ghi nhận 3.500.000 ₫ từ Phòng 3. Hoàn tác" | "Success!" |
| Error | "Chưa lưu được. Kiểm tra kết nối mạng rồi thử lại." | Error codes, English stack text |
| Destructive confirm | "Kết thúc hợp đồng Phòng 3 từ ngày 31/10/2026?" | "Are you sure?" |
| Assistant | "Trợ lý ghi chú: 2 phòng chưa đóng tiền tháng 10." | "✨ AI insights" |

No exclamation marks in UI copy. No emoji in UI. Numbers always formatted (DOMAIN-VN §9).

## 4. Constraints

- WCAG 2.2 AA. Touch targets at least 44 × 44 px. Body text 16 px minimum with a user text scale of 100, 115, 130%.
- Every action has a visible text label. Icons support labels; they never replace them on mobile.
- No hover-only and no swipe-only affordances.
- Reversible actions use undo, not confirmation dialogs. Irreversible actions confirm in words that name the object.
- Sensitive content (ID cards, certificates by default) is blurred until tapped.
- Full Vietnamese glyph coverage in every font at every weight used (spike S2).

## 5. Visual direction: lacquer and ledger

The references are a well-kept paper ledger and Vietnamese lacquerware (sơn mài): warm paper, deep ink, one restrained lacquer tone, generous margins, and typography doing the work that boxes and shadows usually do. Think private bank statement, not SaaS dashboard.

Principles:

1. Numbers are the hero. Key amounts set large in the figure font with tabular figures, right-aligned in tables, never squeezed.
2. Structure through type, rule lines and whitespace. Few cards; no cards inside cards; no drop-shadow stacks.
3. One accent, used rarely. Most screens are ink on paper.
4. Status is shape plus word plus color, in that order of importance.
5. Calm motion that confirms, never decorates.

### 5.1 Typography

- Decided in spike S2 (branch `spike/s2-fonts`, 31dd4a6): **Source Sans 3** is the UI sans and **Source Serif 4** is the figure and display face for amounts and page titles. Both are OFL, cover every code point of the glyph test string at every weight used, and give uniform-width lining digits. `DESIGN.md` Typography records the full reasoning.
- Be Vietnam Pro, the first candidate, failed the tabular figures check: its digits are proportional and it has no `tnum` feature, so amounts would not align in a column. Fraunces failed the same check (no `tnum` or `lnum`). Newsreader and Public Sans passed but lost on look next to the chosen pair.
- Both faces are self-hosted from `apps/web/src/fonts/`, subset to Vietnamese and basic Latin. `pnpm glyphs:check` guards the shipped files.
- Never Inter, Arial, Roboto or system defaults as the identity face.
- Glyph test string for `/dev/glyphs` and the coverage script:
  `Đặng Thị Hường, Nguyễn Văn Ước, Phường Dĩ An, Thửa đất số 1234, tờ bản đồ số 56. ẫ ặ ữ ỡ ự ể ộ ổ ỗ ờ ở ợ ụ ủ ứ ừ ử ữ ỳ ỷ ỹ Ỵ. 0123456789 ₫ m² ½`
- Scale (starting point, tune in Phase 0): 13 meta, 15 small, 16 body, 18 lead, 22 h3, 28 h2, 36 h1, 44 and 56 for hero figures.

### 5.2 Color

Define tokens in OKLCH with light and dark sets. Starting values to tune in Phase 0, each pair checked for AA contrast. The tuned light and dark values live in `apps/web/src/design/tokens.ts` and `DESIGN.md`; P0-11 lowered light `due` to 64% lightness to reach 3:1.

| Token | Light | Use |
| --- | --- | --- |
| `paper` | oklch(98.5% 0.006 85) | Page background, warm off-white |
| `surface` | oklch(99.6% 0.003 85) | Raised areas, sheets |
| `ink` | oklch(24% 0.02 60) | Text and primary buttons |
| `ink-muted` | oklch(48% 0.015 60) | Secondary text (never on colored backgrounds) |
| `rule` | oklch(90% 0.01 80) | Hairlines and dividers |
| `lacquer` | oklch(42% 0.11 35) | Brand mark, active navigation marker, rare emphasis. Never a status color |
| `paid` | oklch(52% 0.09 165) | Jade, with a check shape |
| `due` | oklch(70% 0.13 75) | Ochre, with a clock shape |
| `overdue` | oklch(56% 0.19 28) | Vermilion, with a filled diamond shape and the day count |
| `vacant` | oklch(60% 0.03 250) | Slate, with an open square shape |

Status colors above are for shapes, fills and borders, which need 3:1 against their background. Status words use darker text variants (`paid-ink`, `due-ink`, `overdue-ink`, `vacant-ink`, same hue, lightness lowered until 4.5:1 on `paper` and `surface`). The light-mode `due` and `vacant` values above are too light for text. The FND-5 contrast script checks every pair actually used, in both themes.

Primary buttons are ink, not accent. Never pure black or pure white. No gradients except an optional very subtle paper grain.

### 5.3 Layout and density

- Desktop: left sidebar (240 px) with sections; content max width 1200 px; tables are first-class.
- Mobile: bottom tab bar with five items: Tổng quan, Tài sản, Thu tiền, Tài liệu, Trợ lý. Reports and settings live under the avatar menu. Tables become stacked rows with the amount on the right.
- Density: comfortable by default; Ryan can switch to compact (row height and padding tighten, type size does not shrink below 15 px).
- Sheets slide up for quick actions on mobile (record payment, show QR); full pages for anything with more than five fields.

### 5.4 Motion

150 to 220 ms, standard ease-out. Used for sheet entry, list insertions, the undo toast, and number changes after a payment is recorded. No bounce, no elastic, no parallax, no confetti. Respect reduced-motion.

### 5.5 How the assistant looks

The assistant is "Trợ lý", a quiet colleague who leaves notes. Its output looks like annotated notes on ledger paper: a small monogram, a time stamp, short sentences, every number linked to the record it came from, sources as small numbered citation chips that open the source. Proposals are compact cards with two text buttons, "Đồng ý" and "Bỏ qua". No sparkle icons, no gradient orbs, no chat bubbles on the home screen, no typing animations. The Ask screen is a plain conversation page; answers render tables when the answer is a list. A small status line shows when the worker last ran ("Trợ lý chạy lúc 07:00") and turns into a clear offline notice when stale. Diagnostics (auth mode, usage, failed guards) are visible only to operators.

## 6. Key screens

Run `/impeccable shape` for each before building it. Mobile layout first, then desktop.

1. **Tổng quan (Home).** Date line (solar, lunar in P2). "Cần làm hôm nay" list of 3 to 7 items with one action each (record payment, review extraction, renew lease). This month's collection: one large figure "Đã thu 42,5 tr / 51 tr" with a thin progress rule and counts per status. The morning brief note from Trợ lý. Portfolio figure (estimated value, labelled as estimate with date). A small map strip on desktop.
2. **Tài sản (Properties).** List with nickname, kind, current address (old address in muted text when it differs), status shape, monthly rent, completeness ring. Filters as chips. Map toggle.
3. **Property detail.** Header with nickname, both addresses, status, completeness with the next three missing items. Tabs: Tổng quan, Pháp lý (certificates, parcels, structures, owners), Cho thuê (units and leases), Thu chi (ledger), Tài liệu, Hoạt động.
4. **Add property wizard.** Step 1 asks "Bạn có ảnh sổ không?" with camera and file options and a skip. While extraction runs (1 to 2 minutes), the user continues with step 3. Step 2 review shows the certificate image beside fields; low-confidence fields carry an ochre marker and a "kiểm tra lại" label; accepting a field is one tap.
5. **Thu tiền (Collections).** Month selector. Groups: Chưa đến hạn, Đến hạn, Quá hạn, Đã thu. Each row: unit, tenant, amount, due date or days overdue. Row actions: Ghi nhận, Mã QR, Nhắc qua Zalo.
6. **Record payment sheet.** Amount prefilled with the outstanding total in a large figure input that accepts "3tr5", method toggle (Tiền mặt, Chuyển khoản), date defaulting to today, Save. At most 3 taps from the collections row to a saved payment when the prefilled amount is right.
7. **Invoice and receipt.** A5 receipt layout with the household's header, tenant, period, lines, total in words in Vietnamese, VietQR, and the receipt image for Zalo.
8. **Lease detail.** Terms summary, period timeline with payment marks, deposit ledger, documents, Renew and Terminate actions.
9. **Meter entry.** All rooms of a rooming house on one screen, previous reading shown beside the input, numeric keypad, anomaly warning inline.
10. **Tài liệu (Documents).** Search bar first. Groups by property and category. Sensitive items blurred. Expiring soon section.
11. **Trợ lý.** Tabs: Hộp thư (brief, alerts, proposals), Thị trường (research items with sources, filter by property), Hỏi (Ask).
12. **Báo cáo (Reports).** Owner annual tax card, property P&L, rent roll, occupancy. Export buttons.
13. **Cài đặt (Settings).** Household, members, receiving bank accounts, notifications, research topics, assistant status, language, text size, density, data export.

## 7. Component inventory

Build these in Phase 0 and show every state on `/dev/components`, light and dark, at 390 px and 1440 px.

- Money display (full, compact, signed, large figure).
- Money input that accepts Vietnamese shorthand through `parseVndInput`: "3tr5" → 3,500,000; "3,5tr" → 3,500,000; "3.500.000" → 3,500,000; "1ty2" → 1,200,000,000; "850k" → 850,000; "15 triệu" → 15,000,000. Shows the parsed full amount live under the field.
- Date input that accepts typing `dd/mm/yyyy` and a picker; optional lunar line (P2).
- Status mark (shape + word + color) for paid, due, overdue, vacant, draft, ended.
- Completeness ring with the count of missing items.
- Address block showing "Theo sổ" and "Hiện nay".
- Document tile (thumbnail, blurred state, category, expiry).
- Extraction field row (value, confidence marker, source page link, accept, edit).
- Invoice row and collections row with actions.
- QR sheet (large QR, amount, memo, bank, account name, save image).
- Assistant note, citation chip, proposal card, worker status line.
- Empty states with one clear next action.
- Toast with undo. Confirm dialog naming the object. Skeletons that match final layout.
- Table with sticky header, right-aligned tabular figures, row selection for bulk confirm, mobile stacked variant.

## 8. Anti-patterns

Reject in review and let the Impeccable detector catch what it can: purple or blue gradients; glassmorphism; neon; cards nested in cards; icon tiles above headings; gray text on colored backgrounds; pure black or white; emoji in UI; sparkle or magic-wand icons for AI; chat-bubble home screens; uppercase letter-spaced labels everywhere; centered body text; more than one accent; charts with more than three colors; dashboards of meaningless KPI tiles; hover-only actions; icon-only buttons on mobile.

## 9. Design QA per surface

A surface is done when:

1. `pnpm design:detect` reports zero findings on its files. An accepted exception is recorded with `npx impeccable ignores` and a reason in the PR.
2. `/impeccable critique` and `/impeccable audit` have no open high-severity points.
3. `/impeccable harden` has been run: long Vietnamese names and addresses, 130% text scale, empty, loading, error and offline states.
4. Screenshots at 390 × 844 and 1440 × 900, Vietnamese, light and dark, captured through the `verify` skill and attached to the PR.
5. axe has zero serious or critical issues.
6. The glyph test passes for any new font usage.

Phase 6 runs `/impeccable polish` and `/impeccable onboard` across all surfaces, then the Mom test is repeated on the final build.
