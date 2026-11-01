# Workbench

The workbench is the layout of every working screen in Esta: a page head, a summary strip, a filter bar and the data, always in that order, inside `es-workbench`. Markup: `es-workbench` › `es-page-head`, `es-stat-strip`, `es-workbench__bar` (an `es-filter`, an `es-table-search`, secondary actions), then an `es-table-wrap` with its `es-table-foot`.

**Why.** Esta is a tool people open to check numbers and get something done. It earns trust the way a good ledger does: the same places for the same things, every figure aligned, nothing decorative. Premium comes from the build quality, not from styling.

**Rules.**
- One `es-btn--primary` per screen, in the page head. Secondary actions sit beside it or in the bar.
- The summary strip holds two to four figures that answer "how are we doing". Exact amounts on desktop; compact (`42,5 tr`) only where space forces it, with the exact amount in `title`.
- The filter bar narrows the one list on the page; counts in each option say how many rows it will show before it is pressed.
- The table ends in a totals line (`es-table-foot`) whenever the rows hold money.
- Colour: blue for the primary action, the current nav item and selected rows; status colours only inside badges. Everything else is ink, grey and hairlines.
- Type: Inter only. Page titles `title-1` on desktop, `title-2` on phones. No brand-layer type (`es-mk-*`, Inter Display) inside the app.
- Phones get the same markup. The strip folds to two columns, the filter wraps, the table collapses to a list under 640px of container width.

The consumer provides: the title and period line, two to four summary figures, the filter options with counts, the rows and the totals.
