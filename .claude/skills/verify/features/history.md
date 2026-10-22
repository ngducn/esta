# Change history and undo

The operator sees every batch Claude applied through the connector on `/settings/history`, newest first: the summary Claude showed, a `qua Claude` tag, who applied it and when, and its status (`Đã áp dụng`, `Áp dụng một phần`, `Đã hoàn tác`). `Hoàn tác` asks first, then puts the whole batch back. A property the batch added goes to `Đã lưu trữ`, and the row links there. When an issued bill, a payment, a deposit or a later edit depends on the batch, the row says why in plain Vietnamese and names the flow to use instead.

## Sub-features

- `history-list` lists applied, partial and undone batches for the operator; any other member gets a 404.
- `history-undo` undoes a batch after the confirm dialog and shows `Đã hoàn tác`.
- `history-refused` shows `Không hoàn tác được.` with one reason and flow per blocking kind, and changes nothing.

## How to get to it (user POV)

- As the operator, open `Cài đặt` and tap `Lịch sử thay đổi qua Claude`.

## Driving it with the verify skill

- Batches come only from the connector. Sign a new household's operator in with `pnpm connector:login` (`ESTA_SESSION_FILE` set to a temporary file), then plan and apply through `pnpm connector` as `e2e/connector-history.spec.ts` does, or run `pnpm --dir apps/connector test:integration`, which leaves batches on lanes 7, 8 and 9 (sign in as `ryan.lane9@demo.esta.test`).
- To see a refusal, change a row the batch wrote on its own screen first, for example archive a property Claude added.

## Gotchas

- `me.lane<n>` is an admin but not the operator, so `/settings/history` answers 404 for her and `Cài đặt` shows no link.
- A refusal shows only until the page reloads, because it is the answer to that tap.
