# Motion

Motion in Esta is short and calm: it shows where something came from, then stops.

The page shows the four durations to scale, the three easing curves with their control points, live replays of a toast entering, a bottom sheet sliding up and a switch flipping (each with Phát lại, and a Giảm chuyển động tick that shows the reduced-motion version), and the list of things that never animate.

Rules:

- Durations: `duration-fast` 120ms (hover, press, colour, focus), `duration-base` 180ms (switch, menu, toast, exits), `duration-slow` 240ms (modal, row insert), `duration-sheet` 300ms (phone sheet).
- Easing: `ease-standard` for in-place change, `ease-enter` for arrivals (no overshoot), `ease-exit` for departures. Exits are shorter than entries.
- `prefers-reduced-motion: reduce`: no transforms; sheets and modals fade in place over 120ms; spinners stop and the label says what is happening.
- Never animate money (a changed amount cross-fades once), table rows on sort or filter, page transitions, skeleton shimmer, loops other than a spinner, parallax, bounce, confetti or typing dots.
