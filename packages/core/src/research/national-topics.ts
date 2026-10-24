/** The standing national topics every household follows (AGENT.md §5.2), kept as data so a new one is one entry. */
export const NATIONAL_TOPICS = [
  {
    key: 'national:land_law',
    label: 'Luật Đất đai: sửa đổi và hướng dẫn',
    query_templates: ['Luật Đất đai sửa đổi', 'nghị định hướng dẫn Luật Đất đai mới'],
  },
  {
    key: 'national:rental_tax',
    label: 'Thuế và khai thuế cho thuê nhà',
    query_templates: ['thuế cho thuê nhà cá nhân quy định mới', 'khai thuế cho thuê tài sản hướng dẫn'],
  },
  {
    key: 'national:land_price_tables',
    label: 'Bảng giá đất của Nhà nước',
    query_templates: ['bảng giá đất mới áp dụng', 'nghị quyết điều chỉnh bảng giá đất'],
  },
  {
    key: 'national:mortgage_rates',
    label: 'Lãi suất vay thế chấp',
    query_templates: ['lãi suất vay thế chấp mua nhà ngân hàng'],
  },
] as const;
