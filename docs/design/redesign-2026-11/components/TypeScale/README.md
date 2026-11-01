# Type scale

Fourteen type styles in rem, so the member's text size setting (100, 115 or 130%) scales every one of them.

The page opens with the same property card set in the prototype's flat scale and in the new one, then lists every style (titles, text, tabular figures) with its size, line height, weight and tracking, rendered side by side at 100, 115 and 130% with the resulting pixel sizes.

Rules:

- Use the classes (`title-2`, `body`, `figure-lg`, `amount`) or the matching tokens; never set a raw font size.
- Size, weight and colour each carry one level: 600 titles, 400 body, `text-secondary` second lines, `text-muted` captions.
- `body` (16px) is the floor for anything Mẹ acts on; `caption` is only for timestamps, counts and badge words.
- Line height is at least 1.3× the size, so stacked Vietnamese marks never touch.
- Figures (`figure-*`, `amount`) are tabular; a figure that would not fit switches to the compact form, never a smaller size.
