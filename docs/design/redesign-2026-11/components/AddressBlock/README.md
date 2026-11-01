# Address block

The address block shows a property's address today (`Hiện nay`) above the address printed on its sổ (`Theo sổ`), each labelled, never merged into one line. Markup:

```html
<div class="es-address">
  <div class="es-address__row es-address__row--current"><i data-icon="map-pin"></i>
    <div class="es-address__text"><span class="es-address__label">Hiện nay</span><span class="es-address__value">12 đường Demo Số 7, phường Bến Thành, Thành phố Hồ Chí Minh</span></div>
  </div>
  <div class="es-address__row es-address__row--title"><i data-icon="scroll-text"></i>
    <div class="es-address__text"><span class="es-address__label">Theo sổ</span><span class="es-address__value">Số 12 đường Demo Số 7, phường Bến Thành, quận 1, Thành phố Hồ Chí Minh</span>
      <span class="es-address__note"><i data-icon="info"></i>Tên đơn vị trước sắp xếp năm 2025</span></div>
  </div>
</div>
```

**Why two.** Since the July 2025 reorganisation of administrative units, wards were merged and districts removed, so a sổ issued earlier names units that no longer exist. Today's address finds the house; the printed one matches the paper at the land office. Esta never rewrites the printed one.

**Rows.** `--current` uses `map-pin` and body text. `--title` uses `scroll-text` and body-sm in `text-secondary`, because it is the reference copy. The label sits above each value in caption weight; the icon aligns to the label line.

**States.**
- Both differ: add `es-address__note` under the sổ address when it uses pre-2025 unit names.
- Same on both: the sổ row reads `Giống địa chỉ hiện nay`; do not print the address twice.
- Sổ address missing: `Chưa có` in `text-muted` and an `es-link` action, `Thêm từ ảnh sổ`.
- Loading: the labels stay, each value is one or two text skeletons, `aria-busy="true"`.
- Long: a detail screen wraps every word and never truncates.

**Compact.** `--compact` for cards and list rows: the labels move to screen-reader text, each value clamps to two lines with the full address in `title`, and the sổ row starts with the visible prefix `Theo sổ:` (`es-address__prefix`), so the two stay told apart without icons alone.

**Rules.**
- Do write units in lower case mid-address (`phường`, `quận`) and the province in full (`Thành phố Hồ Chí Minh`).
- Do offer `Chép địa chỉ` and `Mở bản đồ` on the detail screen.
- Don't join the two into one line or put one in brackets after the other.
- Don't use `overflow-wrap: anywhere`; addresses break between words.

The consumer provides: the current address, the printed address or nothing, and whether the printed one uses pre-2025 unit names (DOMAIN-VN decides that from the admin units dataset).
