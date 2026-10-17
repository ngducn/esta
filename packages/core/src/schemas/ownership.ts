import { z } from 'zod';
import { isIsoDate, type IsoDate } from '../date/iso-date';
import { FULL_SHARE_BP } from '../properties/ownership';

/** One row of `ownership_shares`, as `set_ownership_shares` takes it. */
export const ownershipShareSchema = z.strictObject({
  party_id: z.uuid(),
  share_bp: z.number().int().min(1).max(FULL_SHARE_BP),
  named_on_certificate: z.boolean(),
  since: z
    .string()
    .refine(isIsoDate)
    .transform((text) => text as IsoDate)
    .nullable(),
});
export type OwnershipShare = z.output<typeof ownershipShareSchema>;

/** A property's whole set, at most one row per party. The sum is not checked: PRP-3 saves an incomplete set. */
export const ownershipSharesSchema = z
  .array(ownershipShareSchema)
  .max(20)
  .refine((shares) => new Set(shares.map((share) => share.party_id.toLowerCase())).size === shares.length, { message: 'duplicate party' });
