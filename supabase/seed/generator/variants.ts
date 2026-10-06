import type { PropertySeedKey } from './properties.ts';

export type Variant = {
  readonly name: string;
  /** Properties left out of every household, with everything later PRs attach to them (SPEC §9.3). */
  readonly omitProperties: readonly PropertySeedKey[];
};

export const VARIANTS = {
  full: { name: 'full', omitProperties: [] },
  northstar: { name: 'northstar', omitProperties: ['di-an'] },
} as const satisfies Record<string, Variant>;

export type VariantName = keyof typeof VARIANTS;

export function isVariantName(name: string): name is VariantName {
  return Object.hasOwn(VARIANTS, name);
}
