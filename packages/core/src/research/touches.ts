export type TouchedBy = { readonly relatedPropertyIds: readonly string[]; readonly provinceCodes: readonly string[] };

/** Whether a research item concerns a property: it names the property, or its province (AGENT.md §5.2). */
export function researchTouches(item: TouchedBy, property: { readonly id: string; readonly provinceCode: string | null }): boolean {
  return item.relatedPropertyIds.includes(property.id) || (property.provinceCode !== null && item.provinceCodes.includes(property.provinceCode));
}
