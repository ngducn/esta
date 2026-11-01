# Components

Every component is plain HTML with `es-*` classes from `components/bundle.css`; icons are `<i data-icon="name">` turned into Lucide SVG by `Esta.hydrate()`. Each component page shows all of its states in light and dark, and in both densities where density changes it.

## Conventions

- **States** are real pseudo-classes (`:hover`, `:focus-visible`, `:active`, `:disabled`) plus mirror classes for documentation and tests: `is-hover`, `is-focus`, `is-active`, `is-error`, `is-loading`, `is-selected`, `is-open`. Disabled uses the `disabled` attribute or `aria-disabled="true"`, never opacity.
- **Error** is always a word and an icon below the control (`es-field__msg`), with `aria-invalid` and `aria-describedby`; the edge turns `danger-text`. Never colour alone, never a toast for a field error.
- **Loading** keeps the layout: buttons keep their label and swap the icon for a spinner; content shows skeletons in its final shape.
- **Long content** wraps; numbers never do. Every component page has a long Vietnamese name and a 12-digit amount at 130% text in mind.
- **Touch**: every interactive target is at least `touch-min` (44px) on a touch screen, in both densities.
- **Labels**: every action has visible words. Icon-only buttons exist only on desktop toolbars, with `aria-label` and a tooltip.

## Inventory

| Group | Component | Classes | One rule |
| --- | --- | --- | --- |
| Actions | Button | `es-btn` + `--primary` `--secondary` `--ghost` `--danger` `--danger-quiet` `--icon`; `--sm` `--lg` `--block` | One primary per view |
| Forms | Text input | `es-field` › `es-field__label`, `es-input`, `es-field__hint`, `es-field__msg` | The label sits above, always visible; placeholder is an example, never the label |
| | Money input | `es-field es-money` › `es-input-group` › `es-input[data-es-money]` + `es-affix`; `[data-es-money-out]`, `[data-es-money-words]` | Accepts `3tr5`, confirms `= 3.500.000 ₫` live |
| | Date input | `es-field` › `es-input-group` › `es-input[data-es-date]` + calendar button; `[data-es-date-out]`; `es-calendar` popover | Typing first, picker second; confirms the weekday |
| | Select | `es-select` (native, styled) and `es-listbox` (open state) | Native on phones so Android's picker opens |
| | Textarea | `es-textarea` + `es-field__count` | Grows to 6 lines, then scrolls |
| | Checkbox | `es-check` › `input` + `es-check__box` + text | The whole row is the hit area |
| | Radio | `es-radio` › same shape | Groups in a `fieldset` with a `legend` |
| | Switch | `es-switch` › `input[role=switch]` + `es-switch__track` | Applies immediately; for anything that needs Lưu, use a checkbox |
| | Selection card | `es-choice` › `input` + `es-choice__body` + `es-choice__mark` | One signal: the mark fills; border and fill stay |
| Status | Status badge | `es-badge` + `--paid` `--due` `--overdue` `--empty` `--draft` `--ended`; `--lg` | Icon + word + colour, never colour alone |
| | Completeness | `es-complete` + `--full` `--partial` `--empty`; `es-complete__ring` | Counts what is missing, in words |
| Data | Address block | `es-address` › `es-address__row` (`--current`, `--title`) | Hiện nay first, Theo sổ second, never merged |
| | Data table | `es-table-wrap` › `es-table[data-es-sortable][data-es-selectable]`, `es-bulkbar` | Becomes a list under 640px of container width |
| | Stat card | `es-stat` › `__label`, `__value`, `__sub`, `es-meter` | One figure per card, compact form, exact on hover |
| | Summary strip | `es-stat-strip` › `__grid` (`--cols`) › `es-stat` | Two to four figures in one hairline strip on working screens |
| | Filter tabs | `es-filter` › `es-filter__opt[aria-pressed]` + `es-filter__n` | One status filter with counts; one option always pressed |
| | Property card | `es-prop` › `__photo`, `__tag`, `__body`, `__title`, `es-address`, `__rent`, `__meta` | Photo first: Mẹ recognises a house before its nickname |
| | Empty state | `es-empty` › `__title`, `__body`, `__actions` | An action, never an apology or a promise |
| Feedback | Toast | `es-toast` + `--success` `--error`; `es-toast__action` | Undo for anything reversible |
| | Inline confirmation | `es-confirm` | Replaces the row's actions in place; names the object |
| | Modal | `es-scrim` › `es-modal` › `__head`, `__body`, `__foot` | Desktop only; becomes a bottom sheet on phones |
| | Bottom sheet | `es-sheet` › `__grabber`, `__head`, `__body`, `__foot` | The phone's way to do a quick task without leaving the list |
| | Skeleton | `es-skel` + `--text` `--title` `--figure` `--avatar` `--photo` | The shape of what is coming, holding still |
| App shell | Page header | `es-page-head` › `__text` (`__title`, `__meta`), `__actions` | Says what the screen is, then what you can do; one primary, last |
| | Sidebar nav item | `es-nav-item` + `aria-current="page"`; `es-count` | Icon + label, current marked by fill and weight |
| | Family switcher | `es-switcher` + `es-menu` list | An identity block with a chevron, never a field |
| | Bottom nav item | `es-tabbar` › `es-tab` | Icon + label, current marked by a blue pill behind the icon |
| | Avatar | `es-avatar` + `--sm` `--md` `--lg` `--assistant` | Initials for people, the monogram ring for Trợ lý |
| | Account menu | `es-menu` › `es-menu__head`, `es-menu__item`, `es-segmented` | Text size, theme, density and language live here |
| Patterns | Workbench | `es-workbench` › `es-page-head`, `es-stat-strip`, `es-workbench__bar`, `es-table-wrap` | Every working screen: what it is, the numbers, the filter, the list and its total |
| Brand | Brand layer | `es-mk-eyebrow`, `es-mk-hero`, `es-mk-title`, `es-mk-figure`, `es-mk-frame`, `es-mk-way`, `es-mk-panel`, `es-mk-lines`, `es-mk-photo`, `es-btn--pill` | Website, onboarding, sign-in and report covers only; never inside the app |

## Supporting classes

Shared pieces the components above are built from. Use them; do not restyle them per screen.

| Class | What it is |
| --- | --- |
| `es-icon` | Any Lucide icon from `Esta.icon()` or `<i data-icon>`; sized by the text beside it |
| `es-num` + `--pos` `--neg` `--zero` `--unknown` | A money or count figure: tabular lining digits, never wraps; green only for money received, muted for zero and unknown |
| `es-link` | Inline text link in `accent-text` blue, always underlined; the underline thickens on hover |
| `es-card`, `es-divider` | The hairline card surface and a hairline rule |
| `es-focusable`, `es-sr-only` | The shared focus ring; text only screen readers hear |
| `es-spinner` | The one loading spinner, for buttons and retries only (pages use skeletons) |
| `es-tooltip` in `es-tip-wrap` | The label for an icon-only button |
| `es-fieldset`, `es-choice-group`, `es-switch-list` | Groups of fields, selection cards and switches with one legend |
| `es-chips` › `es-chip` | Filter chips above a list or table |
| `es-meter` | The thin progress bar under a stat (collected of expected) |
| `es-table-toolbar`, `es-table-search`, `es-table-sortby`, `es-table-scroll`, `es-table-foot` | The parts around a data table: search, the phone sort menu, the scroll box and the totals row |
| `es-c-title` `es-c-tenant` `es-c-amount` `es-c-due` `es-c-status` `es-c-select` `es-c-action` | Column roles in a data table; they decide each cell's place in the phone list layout |
| `es-prop-grid` | The responsive grid of property cards |
| `es-count` | A small count on a nav item or tab icon |
| `es-toaster` | Where toasts stack: centred above the tab bar on phones, bottom left of the content from 840px |
| `es-popover-anchor` | Wraps a trigger and the menu, list or calendar that opens under it |
| `es-sidebar` › `es-brand` (`__word`, `__seal`), `es-brand__mark`, `es-nav`, `es-member` | The desktop sidebar: the ESTA wordmark (the E tile on the rail), nav list and the signed-in member |
| `es-avatar-group` | Overlapping avatars for a group of people, such as family members |
