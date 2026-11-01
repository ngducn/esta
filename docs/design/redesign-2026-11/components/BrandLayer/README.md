# Brand layer

The brand layer is how Esta looks where it introduces itself (the website, onboarding, the sign-in page, emails and printed report covers), and it never appears inside the working app. Classes: `es-mk-eyebrow`, `es-mk-hero` › `es-mk-hero__line` (`--end`) + `es-mk-hero__rule`, `es-mk-title`, `es-mk-figure` + `es-mk-unit`, `es-mk-frame`, `es-mk-way` (`--quiet`), `es-mk-panel`, `es-mk-lines` (`--rows`), `es-mk-photo` › `img` + `es-mk-photo__cap`, and `es-btn--pill`.

**Type.** Inter Display (the display optical size of Inter) Light 300 for headlines and figures, Medium 500 for spaced capitals. Styles: `brand-hero` 96/116, `brand-title` 56/68, `brand-figure` 64/78, `brand-eyebrow` 12/16 at +0.18em. Leading is at least 1.2 so stacked marks (Ỗ over ặ) clear. Light only at 32px and above.

**Devices.**
- *Split headline*: two lines, each paired with a ruled line that carries a short heavy segment, the second line right-aligned. One per page.
- *Spaced capitals* above a headline or a figure, saying what it is.
- *Raised units* on figures: `84<span class="es-mk-unit">m²</span>`.
- *Double frame*: a hairline card with a second hairline offset 6px down and right, for a property or a promise.
- *Wayfinding rows*: a ruled line, a spaced-capital label and an arrow, leading into detail.
- *Line patterns*: fine 8px-pitch lines fading across a photo or the blue panel; vertical over photos, horizontal (`--rows`) in panels, like ledger lines.
- *Pill buttons* (`es-btn--pill`) for marketing calls to action.

**Colour.** The same tokens as the app: ink, white, `bg`, Esta blue for the one call to action and at most one solid panel per section. Photography is real Vietnamese homes, warmly lit.

The consumer provides: the copy, the photo and its caption, and the figures.

- Do keep one split headline and one solid blue panel per screen.
- Don't use any `es-mk-*` class, Inter Display or pill buttons inside the app; the workbench uses Inter and 8px-radius buttons.
