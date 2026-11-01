# Select

A styled native `<select>` for choosing one of many, with an `es-listbox` for the desktop picker when options need a second line. Markup: `<div class="es-select"><select class="es-select__native" id="p">…</select><i data-icon="chevron-down" class="es-select__chevron"></i></div>` inside an `es-field` with its label.

**Why native.** On Android the real select opens the system picker with large rows Mẹ already knows, and it follows her text size. Keep it native on phones.

**Placeholder.** Make the first option `value="" disabled selected hidden` and the select `required`; it shows in `text-muted` until a choice is made (or add `is-placeholder`).

**Listbox.** For a desktop picker whose options need a meta line (an area, a reason it is unavailable), render `ul.es-listbox[role=listbox]` under the field: `es-listbox__group` headings, `es-listbox__option[role=option]` rows at least 44px, `es-listbox__meta` for the second line, `es-listbox__check` for the chosen one (`aria-selected="true"`), `is-active` for the keyboard cursor and `aria-disabled="true"` with the reason in the meta line. Set `is-open` on `es-select` while it is open; the chevron turns.

**States.** Hover edge `text-muted`; focus-visible ring on the wrapper (Chromium draws a select's own outline square); error as other fields; loading `is-loading` swaps the chevron for an `es-spinner`; disabled uses the `disabled` attribute and a hint saying why. A long chosen value ends in an ellipsis in the box and wraps in full in the list.

The consumer provides: the label, the options (and groups), the chosen value, the reason text for any unavailable option.

**Do** use radios for five or fewer short options. **Don't** build a custom dropdown for phones, or hide why an option is unavailable.
