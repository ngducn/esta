# Density

Two densities share every component: Thoáng (default, for Mẹ on a phone) and Gọn (compact, for Ryan at a desk).

The page renders the same small form, a three-row table and a two-line list row in Thoáng and Gọn, light and dark, with the heights, gaps and padding measured live under each, then a table of the seven density variables and their values.

Rules:

- Set `data-density="gon"` on `<html>` or any container; components read `--control-h`, `--row-h`, `--list-row-h`, `--card-pad`, `--cell-x`, `--stack` and `--field-gap`, never the raw `thoang-*` or `gon-*` tokens.
- Gọn changes spacing only. Type sizes, icon sizes and line heights are identical in both.
- On a touch screen (`pointer: coarse`), Gọn controls stay at `touch-min` (44px).
- New components take their heights and padding from these variables, so they follow the member's density without extra code.
