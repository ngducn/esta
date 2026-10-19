import { describe, expect, it } from 'vitest';
import { INITIAL_WIZARD, readWizard, wizardHref, wizardMachine, wizardPath, type WizardEvent, type WizardState } from './wizard-machine';

const run = (events: readonly WizardEvent[], context: { photo?: boolean; reviewReady?: boolean } = {}): WizardState =>
  events.reduce((state, event) => wizardMachine(state, event, context), INITIAL_WIZARD);

describe('wizardMachine (PRP-7)', () => {
  it('walks photo, details, owners, use and finish, and back from finish to details', () => {
    const steps: string[] = [];
    let state = INITIAL_WIZARD;
    for (const event of ['started', 'next', 'next', 'next', 'back', 'back', 'back', 'back'] as const) {
      state = wizardMachine(state, event, { photo: true });
      steps.push(state.step);
    }
    expect(steps).toEqual(['details', 'owners', 'use', 'finish', 'use', 'owners', 'details', 'details']);
  });

  it('never returns to photo, because the property exists once it is left', () => {
    expect(run(['started', 'back'], { photo: true }).step).toBe('details');
  });

  it('ignores next on photo: only starting the property leaves it', () => {
    expect(run(['next']).step).toBe('photo');
  });

  it.each(['details', 'owners', 'use', 'finish'] as const)('opens review from %s once the extraction needs review and returns there', (step) => {
    const toStep = { details: [], owners: ['next'], use: ['next', 'next'], finish: ['next', 'next', 'next'] } as const;
    const at = run(['started', ...toStep[step]], { photo: true });
    expect(at.step).toBe(step);
    const review = wizardMachine(at, 'openReview', { reviewReady: true });
    expect(review).toEqual({ step: 'review', photo: true, returnTo: step });
    expect(wizardMachine(review, 'next')).toBe(review);
    expect(wizardMachine(review, 'closeReview')).toEqual({ step, photo: true });
  });

  it('keeps review closed while the extraction is still reading', () => {
    const owners = run(['started', 'next'], { photo: true });
    expect(wizardMachine(owners, 'openReview', { reviewReady: false })).toBe(owners);
  });

  it('removes review from a wizard that skipped the photo', () => {
    const owners = run(['started', 'next'], { photo: false });
    expect(owners).toEqual({ step: 'owners', photo: false });
    expect(wizardMachine(owners, 'openReview', { reviewReady: true })).toBe(owners);
    expect(wizardPath(false)).toEqual(['photo', 'details', 'owners', 'use', 'finish']);
    expect(wizardPath(true)).toEqual(['photo', 'details', 'review', 'owners', 'use', 'finish']);
  });

  it('cannot open review from photo', () => {
    expect(wizardMachine(INITIAL_WIZARD, 'openReview', { photo: true, reviewReady: true })).toBe(INITIAL_WIZARD);
  });
});

describe('wizardHref and readWizard', () => {
  const ids = { propertyId: '6f9619ff-8b86-4011-b42d-00c04fc964ff', documentId: '7f9619ff-8b86-4011-b42d-00c04fc964ff' };
  const read = (href: string) => readWizard(Object.fromEntries(new URL(href, 'http://esta.test').searchParams));

  it('round-trips every step through the URL', () => {
    const states: WizardState[] = [
      { step: 'details', photo: true },
      { step: 'owners', photo: true },
      { step: 'use', photo: true },
      { step: 'finish', photo: true },
      { step: 'review', photo: true, returnTo: 'use' },
    ];
    for (const state of states) expect(read(wizardHref(state, ids))).toEqual({ state, ids });
    expect(read(wizardHref({ step: 'owners', photo: false }, { ...ids, documentId: null }))).toEqual({ state: { step: 'owners', photo: false }, ids: { ...ids, documentId: null } });
  });

  it('starts at photo without a property id, and never opens review without a document', () => {
    expect(wizardHref(INITIAL_WIZARD, null)).toBe('/properties/new');
    expect(read('/properties/new?step=owners')).toEqual({ state: INITIAL_WIZARD, ids: null });
    expect(read(`/properties/new?property=${ids.propertyId}&step=review`).state).toEqual({ step: 'details', photo: false });
    expect(read(`/properties/new?property=${ids.propertyId}&step=photo`).state).toEqual({ step: 'details', photo: false });
  });
});
