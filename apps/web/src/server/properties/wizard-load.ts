import { PROPERTY_KINDS, USE_MODES } from '@esta/core/properties/form';
import { z } from 'zod';
import type { WizardIds } from '@/components/property-wizard/wizard-machine';
import { createSessionClient } from '@/server/supabase/server';

const propertyRow = z.object({
  nickname: z.string(),
  kind: z.enum(PROPERTY_KINDS),
  use_mode: z.enum(USE_MODES),
  kind_details: z.object({ room_count: z.number().int().optional() }).loose(),
  units: z.array(z.object({ kind: z.string() })),
});

export type WizardProperty = z.output<typeof propertyRow> & { readonly documentId: string | null };

/** The wizard's property under RLS, and its certificate only when that document is this property's. */
export async function loadWizardProperty(householdId: string, ids: WizardIds): Promise<WizardProperty | null> {
  const supabase = await createSessionClient();
  const [property, document] = await Promise.all([
    supabase
      .from('properties')
      .select('nickname, kind, use_mode, kind_details, units(kind)')
      .eq('household_id', householdId)
      .eq('id', ids.propertyId)
      .is('deleted_at', null)
      .is('units.deleted_at', null)
      .maybeSingle(),
    ids.documentId === null
      ? Promise.resolve({ data: null })
      : supabase.from('documents').select('id').eq('household_id', householdId).eq('property_id', ids.propertyId).eq('id', ids.documentId).is('deleted_at', null).maybeSingle(),
  ]);
  const parsed = propertyRow.safeParse(property.data);
  return parsed.success ? { ...parsed.data, documentId: document.data?.id ?? null } : null;
}
