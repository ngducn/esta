# Property card

A property card shows one property in the portfolio grid: its photo first, then its status, nickname, address, monthly rent and record completeness, and the whole card opens the property. Structure:

```html
<article class="es-prop">
  <div class="es-prop__photo"><img src="…" alt=""><span class="es-prop__tag">Dãy trọ</span>
    <button class="es-prop__more" type="button" aria-label="Thêm thao tác cho Dãy trọ Demo Dĩ An"><i data-icon="ellipsis" data-size="20"></i></button></div>
  <div class="es-prop__body">
    <div class="es-prop__badges"><span class="es-badge es-badge--overdue">…2 phòng quá hạn</span></div>
    <h3 class="es-prop__title"><a class="es-prop__link" href="/tai-san/…">Dãy trọ Demo Dĩ An</a></h3>
    <div class="es-address es-address--compact">…Hiện nay row only…</div>
    <p class="es-prop__rent"><span class="es-num">21.400.000 ₫</span><span class="es-prop__per">/tháng</span></p>
    <div class="es-prop__meta"><span class="es-prop__fact"><i data-icon="layout-grid"></i>6 phòng, 1 trống</span> <span class="es-complete es-complete--partial">…</span></div>
  </div>
</article>
```

Lay cards out in `es-prop-grid` (columns of at least 19rem, gap `--stack`); on a phone that is one card per row.

**Why photo first.** Mẹ recognises a house by sight before she remembers its nickname, so the photo leads at a fixed 16:10, cropped to fill. The tag names the kind (`Dãy trọ`, `Căn hộ`, `Nhà phố`, `Đất`, `Ki-ốt`).

**One link.** The title's link stretches over the whole card (`::after`), so a tap anywhere opens the property and a screen reader hears one link with the property's name. The more button sits above it, is a 44px target, and its label names the property. Focus draws the ring around the whole card; hover lifts to `shadow-sm` with a `border-strong` edge.

**Content.**
- Badges: at most two, the most urgent first. Leave the row out when nothing needs attention.
- Title: headline weight, two lines, then `…` with the full name in `title`.
- Address: only `Hiện nay`, compact, two lines. The sổ address belongs on the detail screen.
- Rent: the full monthly amount with `/tháng`. Land or an unlet property shows its estimate instead (`Ước tính 3,2 tỷ ngày 01/10`), compact with the full amount in `title`. No contract: `—` in `text-muted` with `Chưa có hợp đồng`.
- Meta: rooms or area, then the completeness ring and its words.

**States.** Default, hover, focus, no photo (`es-prop__photo--empty`: a camera icon and `Thêm ảnh`, which sits above the card link), long name, unknown rent, and loading (photo, badge, title, text and figure skeletons in the card's final shape, `aria-busy="true"`).

**Rules.**
- Do use a real photo of the property; never a stock image or an illustration.
- Do keep the rent a full amount; the card is where Mẹ checks it.
- Don't add a second button to the body; actions live in the more menu or on the detail screen.
- Don't put an icon tile in place of a missing photo; offer `Thêm ảnh`.

The consumer provides: the photo or nothing, the kind, up to two badges, the name and link, the current address, the rent or estimate, and the meta facts.
