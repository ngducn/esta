# Demo move-in folder

A synthetic folder for the connector's file tools (`docs/spec/CONNECTOR.md` §7): what Ryan would point Claude at to load a portfolio. Every name contains "Demo", the addresses are the P2-01 certificate fixtures' invented ones, and no ID number appears. No real family data belongs here.

| File | What it is |
| --- | --- |
| `Demo/theo-doi-tai-san-demo.xlsx` | The tracker, one sheet `Tài sản` with two properties. One price is typed text (`4,85 tỷ`) and one is a number; one purchase date is a date cell and one is typed text (`15/08/2005`) |
| `Demo/so-hong-demo-le-van-sy.jpg` | The sổ hồng photo of `DEMOQ3`, the `so_hong_pre2009-low-light` certificate fixture |
| `Demo/so-do-demo-cu-chi.jpg` | The sổ đỏ photo of `DEMOCC`, the `so_do_pre2009-low-light` certificate fixture |
| `Demo/hop-dong-thue-demo-le-van-sy.pdf` | A two-page lease contract for `DEMOQ3` |

The seed uses neither certificate photo, so loading the folder into a seeded household raises no duplicate.

## Regenerate

```sh
pnpm fixtures:connector-demo
```

The photos and the PDF come out byte for byte the same. The workbook does not: its zip entries carry the time they were written. Commit it only when its rows change.
