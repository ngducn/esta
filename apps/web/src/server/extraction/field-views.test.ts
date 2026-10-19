import { reviewFields } from '@esta/core/extraction/fields';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'vi',
  getTranslations: async () => (key: string) => key,
}));

const { fieldViews } = await import('./field-views');

const leaf = (value: unknown) => ({ value, confidence: 0.95, page: 1 });

async function parcelArea(value: unknown) {
  const result = { parcels: [{ area_m2: leaf(value), purposes: [] }] };
  const views = await fieldViews(reviewFields('certificate_v1', result), 'certificate');
  return views.find((view) => view.path === 'parcels[0].area_m2');
}

describe('fieldViews', () => {
  it('shows an area the assistant returned as the number 1.255 with a decimal comma and says it is too precise', async () => {
    expect(await parcelArea(1.255)).toMatchObject({ display: '1,255', editValue: '1,255', refusal: 'too_precise', area: null });
  });

  it('shows an area kept as printed text as printed', async () => {
    expect(await parcelArea('1,255 m²')).toMatchObject({ display: '1,255 m²', editValue: '1,255 m²', refusal: 'too_precise', area: null });
  });

  it('shows a readable area in the Vietnamese format', async () => {
    expect(await parcelArea(1250.5)).toMatchObject({ display: '1.250,5 m²', editValue: '1.250,5', refusal: null, area: 1250.5 });
  });
});
