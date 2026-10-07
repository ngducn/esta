import type { PropertySeedKey } from './properties.ts';

type Variant = { readonly omitProperties: readonly PropertySeedKey[] };

export const VARIANTS = {
  full: { omitProperties: [] },
  northstar: { omitProperties: ['di-an'] },
} as const satisfies Record<string, Variant>;

export type VariantName = keyof typeof VARIANTS;

export function isVariantName(name: string): name is VariantName {
  return Object.hasOwn(VARIANTS, name);
}
