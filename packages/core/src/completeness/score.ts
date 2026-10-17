import type { PropertyKind } from '../properties/kinds';
import type { CompletenessCheck, CompletenessFacts, CompletenessResult, MissingItem } from './types';

export const appliesTo = (check: CompletenessCheck, kind: PropertyKind) => check.kinds === 'all' || check.kinds.includes(kind);

/** `n / d` as an integer percent, half up, in integers so 12.5 never rounds down through a float. */
const percentHalfUp = (n: number, d: number) => Math.floor((200 * n + d) / (2 * d));

/**
 * Only the checks that apply to the kind count, so a later check for one kind leaves every other kind's score alone.
 * `href` is `/properties/<id>/<path>#<anchor>`.
 */
export function scoreProperty<Id extends string>(facts: CompletenessFacts, registry: readonly CompletenessCheck<Id>[]): CompletenessResult<Id> {
  const checks = registry.filter((check) => appliesTo(check, facts.kind));
  const total = checks.reduce((sum, check) => sum + check.weight, 0);
  const passing = checks.filter((check) => check.passes(facts));
  const passed = passing.reduce((sum, check) => sum + check.weight, 0);
  const failing = checks
    .filter((check) => !passing.includes(check))
    .toSorted((a, b) => b.weight - a.weight)
    .map((check): MissingItem<Id> => {
      const { path, anchor } = check.link(facts);
      return { id: check.id, href: `/properties/${facts.propertyId}${path === '' ? '' : `/${path}`}#${anchor}` };
    });
  return { percent: total === 0 ? 100 : percentHalfUp(passed, total), failing };
}

export function nextMissing<Id extends string>(result: CompletenessResult<Id>, n: number): readonly MissingItem<Id>[] {
  return result.failing.slice(0, n);
}
