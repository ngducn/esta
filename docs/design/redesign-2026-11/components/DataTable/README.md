# Data table

The data table lists records Ryan can sort, filter and act on in bulk, and turns into a stacked list Mẹ can read on a phone when its own width drops under 640px. Structure:

```html
<div class="es-table-wrap">
  <div class="es-table-toolbar">title · es-table-search · es-table-sortby · es-chips</div>
  <div class="es-bulkbar" hidden>Đã chọn <span data-es-count>0</span> phòng · actions</div>
  <div class="es-table-scroll">
    <table class="es-table" data-es-sortable data-es-selectable>
      <caption class="es-sr-only">Thu tiền tháng 10, 7 khoản</caption>
      <thead>… <th aria-sort="none"><button class="es-table__sort" data-es-sort>Số tiền …</button></th> …</thead>
      <tbody><tr><td class="es-c-select es-table__select">…</td><td class="es-c-title">…</td>…</tr></tbody>
    </table>
  </div>
  <div class="es-table-foot">Đã thu 1 trên 5 khoản · Còn phải thu 28.200.000 ₫</div>
</div>
```

**Cells.** Each `td` names its role, which places it in the list layout:

| Class | Holds | Wide | Narrow (list) |
| --- | --- | --- | --- |
| `es-c-select` | `es-check` with `data-es-select` and a screen-reader name (`Chọn Phòng 1`) | first column | left rail |
| `es-c-title` | `es-table__primary` + `es-table__secondary` | 34% of the leftover width, one line each, `…` with the full name in `title` | top left, two lines |
| `es-c-tenant` | `es-table__tenant` | 26%, one line, `…` | under the title |
| `es-c-amount` | `es-num`, full form; `data-v` holds the integer | right-aligned, never truncates | top right |
| `es-c-due` | `es-num` date; `es-table__inline-label` `Hạn ` | date only | `Hạn 25/09/2026` |
| `es-c-status` | one `es-badge` | nowrap | bottom left |
| `es-c-action` | one `es-btn --sm` | right | bottom right |

**Behaviour** (wired by `Esta.bind`):
- Sort: a `th` with `aria-sort` holds a `button.es-table__sort[data-es-sort]` with the three arrow icons (`es-sort-none`, `es-sort-asc`, `es-sort-desc`); clicking toggles ascending and descending and resets the other columns. Rows sort by each cell's `data-v` (numbers, or `YYYYMMDD` for dates) and fall back to text in Vietnamese collation. Put unknown values at the end (`data-v="-1"` for an amount, a high date).
- Select: `data-es-select` on each row's checkbox, `data-es-select-all` in the header. Selected rows get `is-selected` and `aria-selected`; the header box turns indeterminate while some rows are chosen; `es-bulkbar` appears with the count.

**Filters.** `es-chips` is one group of `es-chip[aria-pressed]` buttons with a count each (`Quá hạn 2`). The pressed chip uses the accent tint. Under 640px a native `Sắp xếp` select replaces the column headers.

**States.** Hover tints the row `bg-subtle`; selected uses `accent-subtle`. Loading keeps the header and shows three rows of skeletons at each column's final width, with `aria-busy="true"` on the table. An empty result is one row holding `es-empty --inline` that says what is true (`Tháng 10 không có phòng nào quá hạn`) and offers `Xem tất cả`. Unknown values are `—` in `text-muted` with `aria-label="Chưa có số liệu"`, never `0 ₫`.

**Density.** Rows are at least `--row-h` (64 Thoáng, 44 Gọn) with `--cell-x` side padding. A row checkbox is 20px on a mouse and gets its 44px hit area back on a touch screen.

**Rules.**
- Do use the full amount (`12.500.000.000 ₫`) in tables; compact belongs on summary cards.
- Do let names truncate, never numbers, dates or badges. Between 640px and about 1000px the table scrolls sideways rather than squeeze them.
- Do give the table a `caption` (visually hidden) that says what it lists.
- Don't colour amounts by status or put more than one action button in a row; more actions go in the row's detail.

The consumer provides: the rows with `data-v` sort keys, the filter counts, the bulk actions, and the footer totals.
