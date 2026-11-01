# Page header

The page header opens every app screen with a title, one line of context and that screen's actions. Markup: `<header class="es-page-head">` › `es-page-head__text` (`h1.es-page-head__title`, `p.es-page-head__meta`) and `es-page-head__actions`.

**Type.** The title is `title-2` (24/32) on phones and `title-1` (30/40) from 1080px, Inter 600, balanced when it wraps. The meta line is `body-sm` in `text-secondary`: the period, a count, a date. Nothing above the title: no eyebrow, no breadcrumb trail longer than one parent.

**Actions.** At most one `es-btn--primary`, always last. Others are `--secondary` or `--ghost`. Under the title's minimum width the actions wrap below it, full height, with their words.

The consumer provides: the title, the meta line, and the actions.

- Do keep the title the name of the thing (`Thu tiền tháng 10`, a property's nickname).
- Don't put a figure or a status in the title; they belong in the summary strip and badges.
