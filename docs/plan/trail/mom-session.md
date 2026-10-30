# Mẹ's session with the Trợ lý thread

This is for Ryan to run, after P5-13 (replying to notes, asking about a property, suggestion chips) is on main. It is the Mom test of SPEC §10.1 plus the new thread. It takes about 20 minutes. Its purpose is to see where Mẹ hesitates before more assistant features are built (standing orders 2026-10-30, rule 3).

## Before she arrives (about 10 minutes)

1. Start a fresh stack on your slot with Demo data:
   `ESTA_SLOT=6 pnpm db:start && ESTA_SLOT=6 pnpm db:reset`
2. Set the morning of the seed's scenario:
   `ESTA_SLOT=6 pnpm clock:set 2026-10-07T07:05:00+07:00`
3. Start the app for your phone with `ESTA_SLOT=6 pnpm dev:lan`. Open the HTTPS address it prints on your phone, then add it to the home screen.
4. Start Trợ lý.
   - **To let her ask in her own words**, run the worker live on your subscription: `ESTA_SLOT=6 ESTA_ENV=development pnpm agent:dev`. Live is the worker's default mode. It needs `CLAUDE_CODE_OAUTH_TOKEN` in `apps/agent/.env.local` and refuses to start without an explicit `ESTA_ENV`. This is a gate demo, which CLAUDE.md allows.
   - **In replay mode** only the ten golden questions and the scripted follow-ups answer, and anything else waits forever. Live mode is what makes the session worth doing.
5. Sign in on the phone as `me@demo.esta.test` with the password `Esta.Demo.2026`. Set the text size the way she uses her own phone.
6. Have something ready to write on: paper, or the table at the end.

## How to watch

- Hand her the phone. Say what to do in your own words, from the Vietnamese lines below. Then stay quiet.
- Don't point, don't touch the screen, and don't explain the app. If she asks, say "Mẹ cứ thử xem". Step in only after 2 minutes of being stuck, and write down where that happened.
- For each task, note the time she took, where she paused or tapped the wrong thing, and her own words when she was confused. Her exact words are worth more than a score.

## Tasks

The first four are the Mom test (SPEC §10.1). Each one passes in under 2 minutes.

| # | Say to Mẹ | Done when | Watch for |
| --- | --- | --- | --- |
| 1 | "Mẹ ghi giúp con là phòng 3 vừa trả tiền mặt tháng này." | The payment is recorded and the room shows as paid | Can she find Thu tiền? Does she trust the prefilled amount? |
| 2 | "Mẹ xem phòng nào ở Dĩ An đang trễ tiền." | She names Phòng 5 | Does she read the board, or does she open each room? |
| 3 | "Mẹ gửi tin nhắc cho người thuê phòng đó." | Zalo opens with the reminder | Does she find the reminder from the board? |
| 4 | "Mẹ tìm giúp con hình sổ đỏ Bảo Lộc." | The certificate photo is open | Does she search, or browse Tài liệu? |
| 5 | "Mẹ mở Trợ lý xem sáng nay có gì." | She reads the morning notes and can say one in her own words | Does she understand the brief? Does Cần xử lý make sense to her? |
| 6 | "Có việc Trợ lý đề xuất, Mẹ đồng ý giúp con." | One suggestion shows Đã đồng ý | Does she understand what she is agreeing to? |
| 7 | "Mẹ hỏi Trợ lý tháng này thu được bao nhiêu, hỏi kiểu của Mẹ." | She reads an answer to her own wording | How does she phrase it? Does she wait for the answer to stream? Does she trust the number? |
| 8 | "Mẹ bấm Trả lời ở tin phòng 5, hỏi khách này trễ mấy lần rồi." | She gets the count | Does she find Trả lời? |
| 9 | "Mẹ nhờ Trợ lý viết tin Zalo nhắc phòng 5, rồi chép lại." | The draft is copied | Does she find Sao chép? Would she send that text? |
| 10 | "Mẹ hỏi Trợ lý bất cứ điều gì Mẹ muốn." | Anything | What she asks unprompted is the most useful line in the whole session. |

## Afterwards

Ask her these three questions and write down her words:
- "Chỗ nào Mẹ thấy khó nhất?"
- "Mẹ có tin con số Trợ lý nói không?"
- "Mẹ muốn Trợ lý làm thêm gì?"

Then paste your notes into the chat, or send a photo of the paper. The root turns each stumble into an issue or a plan change and puts the ones she hit first.

## Notes table

| # | Time | Passed? | Where she paused or tapped wrong | Her words |
| --- | --- | --- | --- | --- |
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |
| 7 | | | | |
| 8 | | | | |
| 9 | | | | |
| 10 | | | | |
