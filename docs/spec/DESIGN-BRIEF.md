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

## 5. Visual direction: bright and calm

Approved by the operator on 2026-10-16 from the canvas mock (`docs/design/redesign-2026-10/`). The references are a well-run banking app and a clean property listing: a cool light-gray ground, white cards, one lacquer-red accent, one sans typeface, line icons beside every label, and real photos of the places. Bright, because Mẹ reads Esta on a phone in daylight and the operator asked for a light app.

Principles:

1. The daily question comes first. Each screen opens on what `docs/plan/trail/ux-daily-use.md` ranks highest: who has paid this month, what is due today, where a document is.
2. Cards on a gray ground. A card is a white surface with a 1 px `rule` border, a 16 px radius and one soft shadow. Inside a card, structure comes from rule lines and spacing. No card inside a card.
3. One accent, lacquer red `#B83A26`, for the primary action, the active navigation item and the brand mark. It is never a status color.
4. Icons sit beside labels. Esta uses lucide line icons (named imports from `lucide-react`) at a 1.75 to 2 stroke. An icon never replaces a label on mobile.
5. Photos for places. Every property shows its photo first, because Mẹ recognizes a house before its nickname. Tenants show initials, never photos.
6. Status is shape plus word plus color, in that order of importance, set as a pill: a tinted fill, the status color for the word, and the shape in the same color.
7. Summary figures use the compact money form ("29 tr"); tables, forms, receipts and QR sheets use the exact amount.
8. Calm motion that confirms, never decorates.

Light is the default whatever the device setting says. Dark applies only when the member chooses it in Cài đặt.

### 5.1 Typography

- One face: **Plus Jakarta Sans** (OFL, variable, weights 400 to 700), self-hosted from `apps/web/src/fonts/` and subset to Vietnamese and basic Latin by `pnpm fonts:build`. It covers every code point of the glyph test string at every weight used, and its `tnum` feature gives uniform-width digits; its default digits are already lining. `pnpm glyphs:check` guards the shipped file.
- Amounts use the `figures` utility (tabular figures) and sit right-aligned in tables.
- Source Sans 3 and Source Serif 4 (spike S2) are retired. Be Vietnam Pro still fails the tabular figures check.
- Never Inter, Arial, Roboto or system defaults as the identity face.
- Glyph test string for `/dev/glyphs` and the coverage script:
  `Đặng Thị Hường, Nguyễn Văn Ước, Phường Dĩ An, Thửa đất số 1234, tờ bản đồ số 56. ẫ ặ ữ ỡ ự ể ộ ổ ỗ ờ ở ợ ụ ủ ứ ừ ử ữ ỳ ỷ ỹ Ỵ. 0123456789 ₫ m² ½`
- Scale: 13 meta (captions only), 15 small, 16 body, 18 lead and card titles, 20 h3, 24 h2 and phone page titles, 30 h1, 34 and 44 for summary figures. Headings are 700 with -0.02em tracking.

### 5.2 Color

Tokens are OKLCH with light and dark sets in `apps/web/src/design/tokens.ts`; `DESIGN.md` lists the hex each light value renders as.

| Token | Light | Use |
| --- | --- | --- |
| `ground` | `#F5F6F8` | Page background, cool light gray |
| `surface` | `#FDFDFF` | Cards, sheets, the sidebar |
| `surface-2` | `#F8F9FB` | Table headers, quiet blocks inside a card |
| `ink` | `#16181D` | Text, secondary (dark) buttons |
| `ink-2` | `#2A2F3A` | Running text in notes |
| `ink-muted` | `#5B6170` | Secondary text, never on a colored fill |
| `rule` | `#E7E9EE` | Card borders and dividers |
| `rule-strong` | `#DCDFE5` | Outline button borders |
| `field` | `#808694` | Input and checkbox borders, 3:1 against every ground |
| `accent` | `#B83A26` | Primary action, active navigation, brand mark |
| `accent-tint` | `#F8EBE9` | Active navigation fill |
| `paid` on `paid-fill` | `#146C3B` on `#ECF8F1` | Check shape |
| `due` on `due-fill` | `#8A4B06` on `#FEF5E6` | Clock shape |
| `overdue` on `overdue-fill` | `#A82A1D` on `#FDEEEC` | Filled diamond with the day count |
| `vacant` on `vacant-fill` | `#475066` on `#F0F2F5` | Open square |

Each status color reaches 4.5:1 on its fill and on every ground, so one token draws both the shape and the word. Never pure black or pure white; the mock's white surface ships as `#FDFDFF`. No gradients.

### 5.3 Layout and density

- Desktop: a white left sidebar (240 px) with the brand mark, the household, the five sections with icons, a "Khác" group with Báo cáo and Cài đặt, and the member block at the bottom. Content max width 1200 px on the gray ground. Tables are first-class.
- Mobile: a header with the date and the account button, and a bottom tab bar with five icon-and-label items: Tổng quan, Tài sản, Thu tiền, Tài liệu, Trợ lý. Reports and settings live under the account menu. Tables become stacked rows with the amount on the right.
- Radii: 10 px for buttons, 12 px for fields and icon tiles, 16 px for cards, full for pills and avatars.
- Density: comfortable by default; Ryan can switch to compact (row height and padding tighten, type size does not shrink below 15 px).
- Sheets slide up for quick actions on mobile (record payment, show QR); full pages for anything with more than five fields.
- A section that has no feature yet says in one sentence what it will do and offers the one action that works today. It never shows a button, search field or bell for a feature that does not exist.

### 5.4 Motion

150 to 220 ms, standard ease-out. Used for sheet entry, list insertions, the undo toast, and number changes after a payment is recorded. No bounce, no elastic, no parallax, no confetti. Respect reduced-motion.

### 5.5 How the assistant looks

The assistant is "Trợ lý", a quiet colleague who leaves notes. Its output is a note card: a small monogram ring in the accent, a time stamp, short sentences, every number linked to the record it came from, sources as small numbered citation chips that open the source. Proposals are compact blocks inside the note with two text buttons, "Đồng ý" and "Bỏ qua". No sparkle icons, no gradient orbs, no chat bubbles on the home screen, no typing animations. The Ask screen is a plain conversation page; answers render tables when the answer is a list. A small status line shows when the worker last ran ("Trợ lý chạy lúc 07:00") and turns into a clear offline notice when stale; it appears only when real worker data backs it. Diagnostics (auth mode, usage, failed guards) are visible only to operators.

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

Reject in review and let the Impeccable detector catch what it can: gradient washes; glassmorphism; neon; cards nested in cards; icon tiles above headings; gray text on colored backgrounds; pure black or white; emoji in UI; sparkle or magic-wand icons for AI; chat-bubble home screens; uppercase letter-spaced labels everywhere; centered body text; more than one accent; charts with more than three colors; tiles that do not answer a daily question in `docs/plan/trail/ux-daily-use.md`; a button, search field or bell for a feature that does not exist yet; hover-only actions; icon-only buttons on mobile.

## 9. Design QA per surface

A surface is done when:

1. `pnpm design:detect` reports zero findings on its files. An accepted exception is recorded with `npx impeccable ignores` and a reason in the PR.
2. `/impeccable critique` and `/impeccable audit` have no open high-severity points.
3. `/impeccable harden` has been run: long Vietnamese names and addresses, 130% text scale, empty, loading, error and offline states.
4. Screenshots at 390 × 844 and 1440 × 900, Vietnamese, light and dark, captured through the `verify` skill and attached to the PR.
5. axe has zero serious or critical issues.
6. The glyph test passes for any new font usage.

Phase 6 runs `/impeccable polish` and `/impeccable onboard` across all surfaces, then the Mom test is repeated on the final build.
