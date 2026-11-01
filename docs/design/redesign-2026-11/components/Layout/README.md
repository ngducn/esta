# Layout

Esta is phone first: a bottom nav and four columns on phones, an icon rail from 840px, a labelled sidebar from 1080px, and content that stops widening at 1440px.

The page draws the phone, tablet and desktop shells to one scale with their columns, lists the breakpoints, shows the maximum content width for each page type against a 1440px window, and draws a phone with its safe areas, header, toast and bottom nav.

Rules:

- Breakpoints: `bp-sm` 600 (2-column card grids), `bp-md` 840 (icon rail, tables become tables), `bp-lg` 1080 (256px sidebar with labels), `bp-xl` 1440 (content stops widening).
- Grid: 4 columns, 16 gutters and 16 padding on phones; 8 columns, 24 gutters and 32 padding from `bp-md`; 12 columns from `bp-lg`.
- Content width by page type: `width-form` 640, `width-reading` 720, `width-list` 1120, `width-dashboard` 1280.
- Bottom nav height is `bottom-nav-height` (64) plus `env(safe-area-inset-bottom)`; content pads its bottom by that plus `space-4`; toasts and sticky sheet footers sit above both; the header respects `env(safe-area-inset-top)` in the installed app.
