/**
 * SPEC §5.4's ten expense categories. `order` is the order the expense sheet offers them, what Mẹ pays most often
 * first, and the order the ledger and reports group them in. `labelKey` is the category's message in the `expenses`
 * namespace.
 */
export const EXPENSE_CATEGORIES = {
  repair: { order: 1, labelKey: 'categories.repair' },
  maintenance: { order: 2, labelKey: 'categories.maintenance' },
  utility: { order: 3, labelKey: 'categories.utility' },
  management_fee: { order: 4, labelKey: 'categories.management_fee' },
  land_tax: { order: 5, labelKey: 'categories.land_tax' },
  rental_tax: { order: 6, labelKey: 'categories.rental_tax' },
  insurance: { order: 7, labelKey: 'categories.insurance' },
  broker_fee: { order: 8, labelKey: 'categories.broker_fee' },
  legal: { order: 9, labelKey: 'categories.legal' },
  other: { order: 10, labelKey: 'categories.other' },
} as const satisfies Record<string, { readonly order: number; readonly labelKey: `categories.${string}` }>;

export type ExpenseCategory = keyof typeof EXPENSE_CATEGORIES;

export const EXPENSE_CATEGORY_IDS = (Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[]).toSorted(
  (a, b) => EXPENSE_CATEGORIES[a].order - EXPENSE_CATEGORIES[b].order,
) as [ExpenseCategory, ...ExpenseCategory[]];

export function isExpenseCategory(value: string): value is ExpenseCategory {
  return Object.hasOwn(EXPENSE_CATEGORIES, value);
}
