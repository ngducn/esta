export const LEASE_STATUSES = ['draft', 'active', 'ended', 'terminated'] as const;
export type LeaseStatus = (typeof LEASE_STATUSES)[number];

export const UTILITIES_MODES = ['tenant_direct', 'metered_by_owner', 'included'] as const;
export type UtilitiesMode = (typeof UTILITIES_MODES)[number];

export const TAX_PAYERS = ['owner', 'tenant_withholds'] as const;
export type TaxPayer = (typeof TAX_PAYERS)[number];

export const BILLING_CYCLES = [1, 3, 6, 12] as const;
export const PERIOD_ANCHORS = ['lease_start', 'calendar_month'] as const;
export const PRORATIONS = ['none', 'by_days'] as const;
