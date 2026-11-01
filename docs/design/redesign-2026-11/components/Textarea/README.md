# Textarea

A multi-line field for notes and reasons that opens two rows tall, grows to six lines with the text, then scrolls. Markup: `<div class="es-field"><label class="es-field__label" for="n">Ghi chú</label><textarea class="es-textarea" id="n" rows="2"></textarea><div class="es-field__foot"><span class="es-field__count">55/500</span></div></div>`.

**Count.** `es-field__count` sits at the right of `es-field__foot`, beside a hint or a message. Show it when a limit exists. Past the limit add `is-over` and `is-error` to the field; the count turns `danger-text` and the message says the limit and the way back (`Tối đa 500 ký tự. Bớt 42 ký tự rồi lưu.`). Never cut the text off silently.

**Growth.** `field-sizing: content` grows the box; `max-height` stops it at six lines so a save button below stays on a phone screen. The user can still drag it taller on desktop.

**States.** Hover, focus-visible, error, disabled and read-only behave as the text input. A textarea has no loading state of its own; when it is filled by Trợ lý, show a skeleton in its place.

The consumer provides: the label, `id`, the value, the limit and the count text, the hint or error.

**Do** keep notes short and to the point. **Don't** use a textarea for a single value, or hide the count once a limit is near.
