import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FieldView } from '@/server/extraction/field-views';
import { renderInLocale } from '@/test/render';
import { ExtractionFieldRow } from './extraction-field-row';

const area: FieldView = {
  path: 'parcels[0].area_m2',
  label: 'Diện tích thửa',
  input: 'area',
  page: 1,
  marked: true,
  display: '1,255 m²',
  refusal: 'too_precise',
  editValue: '1,255 m²',
  options: null,
  area: null,
  section: { key: 'parcels[0]', list: 'parcels', number: 1 },
};

function renderRow(field: FieldView) {
  renderInLocale(
    <ExtractionFieldRow field={field} decision={undefined} editing={false} error={null} canEdit landUseCodes={[]} onDecide={() => {}} onEdit={() => {}} onPage={() => {}} />,
  );
}

describe('ExtractionFieldRow', () => {
  it('shows an area read with three decimals as printed, says why, and asks Mẹ to correct it', () => {
    renderRow(area);
    expect(screen.getByTestId('field-value').textContent).toBe('1,255 m²');
    expect(screen.getByTestId('field-error').textContent).toBe('Diện tích chỉ ghi tới 2 số lẻ. Bấm Sửa để nhập lại.');
    expect(screen.getByTestId('field-correct').hasAttribute('disabled')).toBe(true);
  });

  it('keeps the general message for a value of another kind that does not read', () => {
    renderRow({ ...area, input: 'date', label: 'Ngày cấp', display: '31/02/2027', refusal: 'invalid', editValue: '31/02/2027' });
    expect(screen.getByTestId('field-error').textContent).toBe('Giá trị đọc được chưa đúng dạng. Bấm Sửa để nhập lại.');
  });
});
