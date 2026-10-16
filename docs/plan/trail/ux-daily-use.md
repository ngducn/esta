# Daily use, as Mẹ and Ryan

Written 2026-10-16 for the redesign, from SPEC §1 (users, north-star) and DOMAIN-VN. It ranks what each person does with Esta by how often, then says what the screens must do about it.

## Mẹ

Phone first, Vietnamese only, likely at text scale 115 or 130%. Lives in Zalo and the bank app. Learns about a payment from the bank notification, not from Esta.

| How often | Job | What Mẹ asks |
| --- | --- | --- |
| Every day from the 1st to the 10th | Check who has paid this month | "Ai trả rồi, ai chưa?" |
| Several times a month | Record a transfer the bank just announced | "Phòng 5 vừa chuyển 3tr5" |
| Several times a month | Send the payment QR to a tenant who asks | "Chuyển khoản số nào hả cô?" |
| A few times a month | Remind a late tenant, politely, on Zalo | "Nhắc giùm phòng 2" |
| Once a month | Enter electricity and water readings for every room | "Số điện tháng này" |
| Now and then | Find a document fast and send it (sổ đỏ, hợp đồng, CCCD) | "Sổ đỏ Long An đâu?" |
| Now and then | Check when a contract ends | "Thảo Điền hết hợp đồng chưa?" |
| Rarely | Add a property or a tenant | |

## Ryan

Desktop, weekly. Reviews the month, exports, the tax card against the 500,000,000 VND threshold, settings, and the assistant's diagnostics.

## What the screens must do

1. Mobile Home leads with this month's collection and the list of who has not paid, each row one tap from Ghi nhận, Mã QR or Nhắc Zalo. On a phone the KPI tiles collapse into one collection card.
2. Ghi nhận tiền is the primary action everywhere it exists. Mã QR and Nhập chỉ số sit next to it on Home.
3. Summary cards show money in the compact form of DOMAIN-VN `formatVndCompact` ("29 tr", "3,5 tr", "3,2 tỷ") so Mẹ reads them at a glance. Tables, forms, receipts and QR sheets show the exact amount (DOMAIN-VN §9 format).
4. Places are named the way Mẹ says them: "Phòng 5, Dãy trọ Dĩ An", never an id. Overdue says how long: "Quá hạn 12 ngày".
5. Every property shows its photo first; Mẹ recognizes a house before its nickname. Demo properties use licensed stock photos.
6. Tenants show initials, never photos.
7. Tài liệu opens on search.
8. Desktop keeps the sidebar, first-class tables, filters and export for Ryan.
9. No button for a feature that does not exist yet. In Phase 0 each placeholder section says in one sentence what it will do, plus the one action available now.
10. Status stays shape plus word plus color. Touch targets stay 44 px, body text 16 px.
