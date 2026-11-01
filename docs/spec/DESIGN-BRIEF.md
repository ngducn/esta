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
- Every document shows clear, sensitive ones included (Ryan's ruling of 2026-10-19, DOC-5).
- Full Vietnamese glyph coverage in every font at every weight used (spike S2).

## 5. Visual direction: the calm blue workbench

Ryan redesigned Esta on 2026-11-01. His design system artifact (https://claude.ai/artifact/8USdYGBumJc9AuaMsQfZKg) is the source of truth, copied to `docs/design/redesign-2026-11/`, and `DESIGN.md` records how the code carries it. It replaces the 2026-10-16 direction (lacquer red, house mark). The feel is a mature, well-funded money product: calm, exact, trustworthy and conventional on purpose, so Esta sits comfortably beside a bank app on Mẹ's phone.

Principles:

1. The daily question comes first. Each screen opens on what `docs/plan/trail/ux-daily-use.md` ranks highest: who has paid this month, what is due today, where a document is.
2. The app is a workbench. Every working screen follows one pattern: page head, summary strip, filter bar, data with its total (the redesign's later slices apply it screen by screen).
3. Cards on a grey ground. A card is a white `surface` with a 1 px `border` hairline, a 12 px radius and `shadow-xs`. Inside a card, structure comes from hairlines and spacing. No card inside a card.
4. One accent, Esta blue `#1b5bda`, the same fill in both themes, for the one primary action, checked controls, the current page and the brand mark. It is never a status, a money series or decoration. Danger keeps red.
5. Icons sit beside labels. Lucide line icons at a 1.75 stroke, sized by the text beside them. An icon never replaces a label on a phone.
6. Photos for places. Every property shows its photo first, because Mẹ recognizes a house before its nickname. People show initials.
7. Status is an icon, a word and a colour, set as a badge on the tone's tinted ground. The word carries the meaning; the colour confirms it.
8. Summary figures use the compact money form (`42,5 tr`); tables, forms, receipts and QR sheets use the exact amount.
9. Calm motion that confirms, never decorates.

Light is the default whatever the device setting says. Dark applies only when the member chooses it.

### 5.1 Typography

- One face in the app: **Inter** (OFL, variable, weights 400 to 600 and optical size 14 to 32), self-hosted from `apps/web/src/fonts/` and subset to Vietnamese and basic Latin by `pnpm fonts:build`. It covers every code point of the glyph test string at every weight used, its `tnum` feature gives uniform-width digits, and it has ₫. `pnpm glyphs:check` guards the shipped file. Inter Display is for the brand layer only (RD-6).
- Amounts use the `num` utility (tabular figures, never wrapping) and sit right-aligned in tables.
- Never Arial, Roboto or system defaults as the identity face.
- Glyph test string for `/dev/glyphs` and the coverage script:
  `Đặng Thị Hường, Nguyễn Văn Ước, Phường Dĩ An, Thửa đất số 1234, tờ bản đồ số 56. ẫ ặ ữ ỡ ự ể ộ ổ ỗ ờ ở ợ ụ ủ ứ ừ ử ữ ỳ ỷ ỹ Ỵ. 0123456789 ₫ m² ½`
- Type styles by name: `display` 40, `title-1` 30, `title-2` 24, `title-3` 20, `headline` 18, `body` and `body-strong` 16, `label` and `body-sm` 15, `caption` 14, and for money `figure-xl` 40, `figure-lg` 32, `figure-md` 24, `amount` 16. Weights 400 for reading, 500 for labels and amounts, 600 for titles and summary figures, nothing heavier. Line height never below 1.3. The design system's 14 px caption is accepted.

### 5.2 Color

Role tokens with light and dark sets in `apps/web/src/design/tokens.ts`, holding the exact hex of the design system's `tokens.json`. Neutrals are cool and quiet; dark mode has its own steps rather than an inversion.

| Token | Light | Use |
| --- | --- | --- |
| `bg` | `#f5f7f9` | Page ground, cool light grey |
| `surface` | `#ffffff` | Cards, inputs, the sidebar, the bottom nav |
| `surface-raised` | `#ffffff` | Menus, sheets, modals (one step lighter in dark) |
| `bg-subtle` | `#fafafc` | Table headers, quiet blocks inside a card |
| `text` | `#15191f` | Reading text, ≥ 7:1 everywhere |
| `text-secondary` | `#454c57` | Second lines, ≥ 7:1 |
| `text-muted` | `#5e6570` | Counts and timestamps, never on a coloured fill |
| `border` | `#e3e6eb` | Card borders and dividers |
| `border-field` | `#757c88` | Input and checkbox edges, 3:1 against every ground |
| `accent` | `#1b5bda` | The one primary action, checked controls, brand mark |
| `accent-text` | `#144bb7` | Links and the current nav item |
| `accent-subtle` | `#f1f6fe` | Where you are: current nav item, pressed chip |
| `success-text` on `success-bg` | `#1b6c3a` on `#ebfbee` | Paid, `circle-check` |
| `warning-text` on `warning-bg` | `#975215` on `#fff6e4` | Due soon, `clock` |
| `danger-text` on `danger-bg` | `#a82522` on `#fff2f0` | Overdue, failed, destructive, `triangle-alert` |
| `info-text` on `info-bg` | `#144bb7` on `#f1f6fe` | Draft, tips, `pencil-line` |
| `neutral-text` on `neutral-bg` | `#454c57` on `#eceff3` | Empty or ended, `circle-dashed` or `archive` |

Never pure black; white is for cards and inputs only. No gradients.

### 5.3 Layout and density

- Phone (under 840 px): a header with the date and the account button, and a bottom tab bar with five icon-over-word items: Tổng quan, Tài sản, Thu tiền, Tài liệu, Trợ lý. The current tab has an `accent-subtle` pill behind its icon; labels wrap at 130% and never hide. Tables become stacked rows with the amount on the right.
- Tablet (840 px): the sidebar collapses to an icon rail.
- Desktop (1080 px): a 256 px sidebar with the ESTA wordmark, the five sections, Báo cáo and Cài đặt, and the member block. Content widths per page type: forms 640, reading 720, lists 1120, dashboards 1280.
- The account menu (member block, or the phone header's avatar as a bottom sheet) holds Cỡ chữ, Giao diện, Mật độ and Ngôn ngữ as segmented controls that apply on tap, then Báo cáo, Cài đặt and Đăng xuất.
- Radii: 8 px for buttons, inputs and nav items, 12 px for cards, menus and toasts, 16 px for modals, 24 px for the top of a phone sheet, full for badges, chips and avatars.
- Density: Thoáng by default; Gọn for Ryan at a desk tightens control height (48 to 40), row height (64 to 44) and card padding (24 to 16). Gọn never shrinks type or a touch target under 44 px.
- Sheets slide up for quick actions on a phone (record payment, show QR); modals on desktop; full pages for anything with more than five fields.
- A section that has no feature yet says in one sentence what it will do and offers the one action that works today. It never shows a button, search field or bell for a feature that does not exist.

### 5.4 Motion

120, 180, 240 and 300 ms on a standard ease for change in place, an entering ease with a long calm settle for arrivals and a shorter exiting ease for departures. Sheets, modals, toasts, menus, row inserts and the switch thumb move. Money never counts up, tables never animate on sort, skeletons hold still. No bounce, no elastic, no parallax, no confetti. Reduced motion removes every transform.

### 5.5 How the assistant looks

The assistant is "Trợ lý", a quiet colleague who leaves notes and answers when written to. Trợ lý is one thread per person, read like a messaging app with the newest at the bottom (Ryan's direction of 2026-10-25). Its notes arrive in the thread: the morning brief, alerts, proposals and the weekly review. Mẹ writes back in the same place, about her houses or anything else.

- Each Trợ lý message is a note card: a small TL monogram ring, a time stamp, short sentences, every number linked to the record it came from or carrying its source. A web figure carries a small numbered citation chip that opens the page, and a calculated figure carries a `Cách tính` line with its working.
- Her own messages sit on the right as plain tinted blocks with no tail and no avatar. A reply to a note shows the note's title above her text.
- Proposals are compact blocks inside the note with two text buttons, "Đồng ý" and "Bỏ qua". A hidden note collapses to one muted line, so the thread keeps its order.
- A reply box is always at the bottom, above the tab bar on a phone, with a text `Gửi` button. Up to three suggested replies drawn from today's notes sit above it as text chips.
- Open urgent items stay pinned above the thread under `Cần xử lý`, so a new day's messages never bury them. The pinned area folds to one line with its count, and on a phone it never takes more than a third of the screen, even at 130% text.
- Answers render tables when the answer is a list, and an answer Mẹ may send on (a Zalo draft) has a `Sao chép` text button.
- Streaming text appears a sentence at a time. Until the first sentence, one static line says what Trợ lý is doing: "Trợ lý đang trả lời", or "Trợ lý đang tra cứu trên mạng".
- No sparkle icons, no gradient orbs, no typing animations (no bouncing dots, no blinking caret, no shimmer), no avatar other than the monogram, and no chat bubbles on the home screen. Home shows the morning brief as a note card with a `Trả lời` link into the thread.

A small status line shows when the worker last ran ("Trợ lý chạy lúc 07:00") and turns into a clear offline notice when stale; it appears only when real worker data backs it. Diagnostics (auth mode, usage, failed guards) are visible only to operators.

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
10. **Tài liệu (Documents).** Search bar first. Groups by property and category. Expiring soon section.
11. **Trợ lý.** Tabs: Tin nhắn, the thread (Trợ lý's notes and her conversation with it, pinned open items, open tasks and the reply box), and Thị trường (research items with sources, filter by property). Property detail offers "Hỏi Trợ lý về tài sản này", which opens the thread with that property as the topic.
12. **Báo cáo (Reports).** Owner annual tax card, property P&L, rent roll, occupancy. Export buttons.
13. **Cài đặt (Settings).** Household, members, receiving bank accounts, notifications, research topics, assistant status, language, text size, density, data export.

## 7. Component inventory

Build these in Phase 0 and show every state on `/dev/components`, light and dark, at 390 px and 1440 px.

- Money display (full, compact, signed, large figure).
- Money input that accepts Vietnamese shorthand through `parseVndInput`: "3tr5" → 3,500,000; "3,5tr" → 3,500,000; "3.500.000" → 3,500,000; "1ty2" → 1,200,000,000; "850k" → 850,000; "15 triệu" → 15,000,000. Shows the parsed full amount live under the field.
- Date input that accepts typing `dd/mm/yyyy` and a picker; optional lunar line (P2).
- Status badge (icon + word + colour) for paid, due, overdue, empty, draft, ended.
- Completeness ring with the count of missing items.
- Address block showing "Theo sổ" and "Hiện nay".
- Document tile (thumbnail, category, expiry).
- Extraction field row (value, confidence marker, source page link, accept, edit).
- Invoice row and collections row with actions.
- QR sheet (large QR, amount, memo, bank, account name, save image).
- Assistant note, citation chip, proposal card, worker status line.
- Empty states with one clear next action.
- Toast with undo. Confirm dialog naming the object. Skeletons that match final layout.
- Table with sticky header, right-aligned tabular figures, row selection for bulk confirm, mobile stacked variant.

## 8. Anti-patterns

Reject in review and let the Impeccable detector catch what it can: gradient washes; glassmorphism; neon; cards nested in cards; icon tiles above headings; muted text on coloured backgrounds; pure black; emoji in UI; sparkle or magic-wand icons for AI; chat-bubble home screens; uppercase letter-spaced labels everywhere; centered body text; the accent as a status or decoration; charts with more than three colors; tiles that do not answer a daily question in `docs/plan/trail/ux-daily-use.md`; a button, search field or bell for a feature that does not exist yet; hover-only actions; icon-only buttons on mobile.

## 9. Design QA per surface

A surface is done when:

1. `pnpm design:detect` reports zero findings on its files. An accepted exception is recorded with `npx impeccable ignores` and a reason in the PR.
2. `/impeccable critique` and `/impeccable audit` have no open high-severity points.
3. `/impeccable harden` has been run: long Vietnamese names and addresses, 130% text scale, empty, loading, error and offline states.
4. Screenshots at 390 × 844 and 1440 × 900, Vietnamese, light and dark, captured through the `verify` skill and attached to the PR.
5. axe has zero serious or critical issues.
6. The glyph test passes for any new font usage.

Phase 6 runs `/impeccable polish` and `/impeccable onboard` across all surfaces, then the Mom test is repeated on the final build.
