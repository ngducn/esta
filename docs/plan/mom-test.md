# Mom test

SPEC §10.1, the human gate after Phase 3 (P3-17), repeated on the final build in Phase 6 (P6-06). Ryan hands his phone to Mẹ with the seeded data and watches without helping. It passes when she finishes each of the four tasks in under two minutes. Each failure becomes a fix before any Phase 4 PR merges.

`pnpm phase:check 3` reads the results table below (its `Mom` row). The row passes once every task has a time under `2:00` and `yes` in the Passed column.

## Before you hand over the phone

1. On the Mac, in the repo: `pnpm db:reset` for the full seed, then `pnpm clock:set 2026-10-07T09:00:00+07:00` so the app's today is SPEC §9.3's day (Phòng 5 of Dãy trọ Dĩ An is 12 days overdue and Phòng 3's October bill is not due yet).
2. Start `pnpm dev:lan` and open the printed `https://<lan>:3443` address on your phone. Trust the dev CA first if you have not (the steps are in `docs/plan/STATUS.md`, Waiting for Ryan).
3. Sign in as Mẹ yourself: `me@demo.esta.test` with the seed's password `Esta.Demo.2026`, or the 6-digit code from the slot's Inbucket mailbox. Leave the phone on Tổng quan, in Vietnamese at the default text size.
4. Have a stopwatch ready. Start it when you finish reading a task aloud; stop it when she shows you the result. Do not point, hint or touch the screen. If she asks, say "Mẹ cứ làm như bình thường".

## The four tasks

Read each one aloud in Vietnamese, one at a time, in this order.

| Task | Say | Done when |
| --- | --- | --- |
| 1. Record a cash payment for Phòng 3 | "Mẹ ghi nhận tiền thuê Phòng 3 ở Dãy trọ Dĩ An, người thuê trả tiền mặt." | A toast reads `Đã ghi nhận 2.500.000 ₫ từ Phòng 3.` and the room moves to `Đã thu` on Thu tiền. |
| 2. Find who is overdue | "Bây giờ phòng nào đang trễ tiền?" | She names or shows Phòng 5 (Hoàng Văn Em Demo), `Quá hạn 12 ngày`. |
| 3. Copy the reminder for that tenant | "Mẹ sao chép tin nhắn nhắc tiền cho người đó để gửi Zalo." | The reminder sheet says `Đã sao chép. Mở Zalo rồi dán vào ô tin nhắn.` |
| 4. Find the Bảo Lộc certificate photo | "Mẹ tìm ảnh sổ hồng của đất Bảo Lộc." | The page of `Sổ hồng Bảo Lộc` is open with the certificate image showing. |

## Results

Run on: (date) · Phone: (model) · Build: (commit)

Write the time as `m:ss` and Passed as `yes` or `no`.

| Task | Time | Passed | Notes |
| --- | --- | --- | --- |
| 1. Record a cash payment for Phòng 3 |  |  |  |
| 2. Find who is overdue |  |  |  |
| 3. Copy the reminder for that tenant |  |  |  |
| 4. Find the Bảo Lộc certificate photo |  |  |  |

## Failures

One line for each place she got stuck: what she was trying to do, what she tapped or said, and how long she hesitated. A task over two minutes or not finished is a failure; so is a word she did not understand or a tap that went somewhere she did not expect, even if she recovered.

- (none recorded yet)
