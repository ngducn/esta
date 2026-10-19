import { planCertificateAcceptance } from '@esta/core/extraction/acceptance';
import { reviewFields } from '@esta/core/extraction/fields';
import { afterEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ locale: 'vi' }));

vi.mock('server-only', () => ({}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => session.locale,
  getTranslations: async () => (key: string) => key,
}));

const { fieldViews } = await import('./field-views');

afterEach(() => {
  session.locale = 'vi';
});

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

  describe.each(['vi', 'en'])('in %s', (locale) => {
    it.each([0.5, 12.3, 125.5, 999.99, 1000, 1255, 1255.5, 12_345.67, 999_999.99, 1_234_567.89, 100_000_000])(
      'opens the area %s in the editor as text that saves as the same area',
      async (area) => {
        session.locale = locale;
        const result = { form: leaf('gcn_2024'), parcels: [{ area_m2: leaf(area), purposes: [] }] };
        const view = (await fieldViews(reviewFields('certificate_v1', result), 'certificate')).find((field) => field.path === 'parcels[0].area_m2');
        const extraction = { id: 'e1', householdId: 'h1', propertyId: 'p1', documentId: 'd1', result };
        const saved = planCertificateAcceptance(extraction, { form: { kind: 'accepted' }, 'parcels[0].area_m2': { kind: 'edited', value: view?.editValue ?? '' } }, { parties: [] });
        expect(saved).toMatchObject({ ok: true, plan: { acceptedFields: { 'parcels[0].area_m2': { decision: 'edited', value: area } } } });
      },
    );
  });
});
