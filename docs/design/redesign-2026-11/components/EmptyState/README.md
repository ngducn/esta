# Empty state

An empty state tells Mẹ in one line what is true when a list, table or section has nothing to show, and puts the next step right under it. Markup:

```html
<section class="es-empty es-empty--card">
  <h3 class="es-empty__title"><i data-icon="house-plus"></i>Chưa có tài sản nào</h3>
  <p class="es-empty__body">Chụp ảnh sổ để Trợ lý điền sẵn thông tin, hoặc nhập tay.</p>
  <div class="es-empty__actions">
    <button class="es-btn es-btn--primary" type="button"><i data-icon="camera"></i>Chụp ảnh sổ</button>
    <button class="es-btn es-btn--secondary" type="button">Nhập tay</button>
  </div>
</section>
```

It is left-aligned like the rest of the page, with a 20px icon inline with the title, never an illustration or an icon tile above it.

**Kinds.**

| Kind | Title | Action |
| --- | --- | --- |
| First use | `Chưa có tài sản nào` | `Chụp ảnh sổ` (primary) and `Nhập tay` |
| Filtered, good news | `Tháng 10 không có phòng nào quá hạn`, with the icon in `success-text` (`es-empty__icon--good`) | `Xem tất cả` |
| No search match | `Không có kết quả cho “Gò Vấp”`, plus what can be searched | `Xoá tìm kiếm` |
| Could not load | `Chưa tải được bảng thu tiền`, plus `Kiểm tra mạng rồi thử lại. Các khoản đã ghi nhận vẫn được lưu.` | `Thử lại`; while retrying, `Đang thử lại` with the spinner |

**Variants.** `--card` stands alone on a page, with card padding that follows density. `--inline` sits inside a section or a table row (`es-table__empty`) with no frame of its own.

**Rules.**
- Do say what is true, then what to do: one title, at most one sentence, at most two actions.
- Do reassure on a failure that saved money is safe; never show an error code.
- Don't apologise (`Rất tiếc`, `Xin lỗi`), and don't promise features (`Sắp có`, `Tính năng đang phát triển`). If a feature is not built, the screen does not mention it.
- Don't use red for an empty list. Only a failed load is a problem, and it still uses words and the retry, not colour.

The consumer provides: the kind, the title, an optional body sentence, and one or two actions.
