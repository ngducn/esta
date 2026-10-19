import { describe, expect, it } from 'vitest';
import { INITIAL_WIZARD, wizardMachine, wizardPath, type WizardEvent, type WizardState } from './wizard-machine';

const run = (events: readonly WizardEvent[], context: { photo?: boolean; reviewReady?: boolean } = {}): WizardState =>
  events.reduce((state, event) => wizardMachine(state, event, context), INITIAL_WIZARD);

describe('wizardMachine', () => {
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
