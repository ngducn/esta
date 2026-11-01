# Date format

How Esta writes dates and times: dd/mm/yyyy with leading zeros, the weekday when a person checks a date, and relative due phrases next to the real date.

The page computes every example live against 07/10/2026: the six forms (date, long with weekday, day and month, month, range, time), due dates from twelve days overdue to seven weeks ahead with the phrase and badge each gets, a mid-sentence use, activity times, the seven weekday names, and what the date input accepts through `parseDate`.

Rules:

- `formatDate` → `07/10/2026` in tables, forms and receipts; `formatDateLong` → `Thứ Tư, 07/10/2026` in page headers, sheets and confirmations; `07/10` only inside the current year; `Tháng 10/2026` for periods; `25/09/2026 – 24/10/2026` for ranges (en dash, spaces); `07:00`, 24-hour.
- Due: `Quá hạn 12 ngày` when past, `Đến hạn hôm nay`, `Còn 3 ngày` within seven days (badge `Đến hạn sau 3 ngày`), then the date: `Hạn 25/11`.
- Activity: `Hôm nay, 09:00`, `Hôm qua, 18:30`, then `05/10, 14:20`; another year adds it.
- Relative words sit beside the date, never instead of it in a record. Sentence case at the start of a badge, lower case mid-sentence.
- Business dates are Asia/Ho_Chi_Minh. The input accepts `07/10/2026`, `7/10/26` and `07-10-2026` and confirms the weekday.
