/** The wizard's main path. `review` is a side step: it opens from any step after `photo` and returns there. */
export const MAIN_STEPS = ['photo', 'details', 'owners', 'use', 'finish'] as const;
export type MainStep = (typeof MAIN_STEPS)[number];
export type WizardStep = MainStep | 'review';

export type WizardEvent = 'started' | 'next' | 'back' | 'openReview' | 'closeReview';

export type WizardState =
  | { readonly step: MainStep; readonly photo: boolean }
  | { readonly step: 'review'; readonly photo: true; readonly returnTo: Exclude<MainStep, 'photo'> };

/** The property exists once `photo` is left, so there is no way back to it; the later steps edit that property. */
const TRANSITIONS: Readonly<Record<MainStep, Partial<Record<WizardEvent, MainStep>>>> = {
  photo: { started: 'details' },
  details: { next: 'owners' },
  owners: { next: 'use', back: 'details' },
  use: { next: 'finish', back: 'owners' },
  finish: { back: 'use' },
};

export const INITIAL_WIZARD: WizardState = { step: 'photo', photo: false };

/**
 * The next state, or the same state when the event does not apply. `reviewReady` is the extraction being
 * `needs_review`, which only a wizard that started with a photo can reach.
 */
export function wizardMachine(state: WizardState, event: WizardEvent, { photo = state.photo, reviewReady = false }: { photo?: boolean; reviewReady?: boolean } = {}): WizardState {
  if (state.step === 'review') return event === 'closeReview' ? { step: state.returnTo, photo: true } : state;
  if (event === 'openReview') {
    return state.step !== 'photo' && state.photo && reviewReady ? { step: 'review', photo: true, returnTo: state.step } : state;
  }
  const next = TRANSITIONS[state.step][event];
  if (next === undefined) return state;
  return { step: next, photo: state.step === 'photo' ? photo : state.photo };
}

/** The steps the progress line counts: `review` sits after `details` only when there is a photo to review. */
export function wizardPath(photo: boolean): readonly WizardStep[] {
  return photo ? ['photo', 'details', 'review', 'owners', 'use', 'finish'] : MAIN_STEPS;
}

export type WizardIds = { readonly propertyId: string; readonly documentId: string | null };
export type WizardRoute = { readonly state: WizardState; readonly ids: WizardIds | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LATER_STEPS = MAIN_STEPS.filter((step): step is Exclude<MainStep, 'photo'> => step !== 'photo');

/** The wizard lives in the URL once the property exists, so a reload or the back button lands on the same step. */
export function wizardHref(state: WizardState, ids: WizardIds | null): string {
  if (state.step === 'photo' || ids === null) return '/properties/new';
  const params = new URLSearchParams({ property: ids.propertyId });
  if (ids.documentId !== null) params.set('document', ids.documentId);
  params.set('step', state.step);
  if (state.step === 'review') params.set('from', state.returnTo);
  return `/properties/new?${params.toString()}`;
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const laterStep = (value: string | undefined) => LATER_STEPS.find((step) => step === value);

/** Reads what `wizardHref` wrote; anything it did not write falls back to the nearest step it names. */
export function readWizard(params: Readonly<Record<string, string | string[] | undefined>>): WizardRoute {
  const propertyId = one(params.property);
  if (propertyId === undefined || !UUID.test(propertyId)) return { state: INITIAL_WIZARD, ids: null };
  const document = one(params.document);
  const documentId = document !== undefined && UUID.test(document) ? document : null;
  const ids = { propertyId, documentId };
  const step = one(params.step);
  if (step === 'review' && documentId !== null) return { state: { step: 'review', photo: true, returnTo: laterStep(one(params.from)) ?? 'owners' }, ids };
  return { state: { step: laterStep(step) ?? 'details', photo: documentId !== null }, ids };
}
