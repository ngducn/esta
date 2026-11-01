# Avatar

An avatar stands for a person with one initial, or for Trợ lý with the `TL` monogram ring. Markup: `<span class="es-avatar" role="img" aria-label="Nguyễn Demo Hường">H</span>`; as a trigger, `<button class="es-avatar" aria-label="Nguyễn Demo Hường, tài khoản" aria-haspopup="menu">H</button>`.

**Initials rule.** People: the first letter of the last word, which in Vietnamese is the given name, the one the family uses (`Nguyễn Demo Hường` → `H`). Keep diacritics: `Ư`, `Đ` and `Ơ` are their own letters. Business tenants: the first letter after the legal form (`Công ty TNHH Phát Đạt` → `P`). Trợ lý: always `TL`. No name yet: the `user` icon. Two-letter initials such as `NH` are not used; they spell the family name, which half the household shares.

**Sizes.** `--sm` 28, `--md` 36 (default), `--lg` 44. The letter is 42% of the size, weight 600.

**Colour.** Everyone gets `neutral-bg` with `neutral-text`. Colour per person would rank people or clash with status colours. `--assistant` is `surface` with an `accent-text` letter and a 1.5px `accent-text` ring, the only ringed avatar.

**Group.** `es-avatar-group` overlaps by 8px with a 2px `surface` ring between; `--more` shows `+N`.

**As a button.** Hover adds a `border-strong` ring, open a `border-field` ring, focus-visible the standard focus ring outside.

The consumer provides: the full name (for the initial and the accessible name), or the assistant flag.

- Do: give the accessible name the full name, not the letter.
- Don't: use photos, emoji or colour to tell people apart.
