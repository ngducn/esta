import { notFound } from 'next/navigation';
import { PropertyForm } from '@/components/properties/property-form';
import { listCommunes, listProvinces } from '@/server/address/suggest';
import { requireMember } from '@/server/member';
import { loadEditableProperty, loadPropertyCodes } from '@/server/properties/form';

/** Step `details`: the P1-05 form over the property step 1 created; saving or `Để sau` moves on. */
export async function StepDetails({ propertyId, next }: { propertyId: string; next: string }) {
  const member = await requireMember();
  const [property, provinces, codes] = await Promise.all([
    loadEditableProperty(member.household.id, propertyId),
    listProvinces(),
    loadPropertyCodes(member.household.id, propertyId),
  ]);
  if (property === null) notFound();
  const province = property.values.address.provinceCode;
  const communes = province === null ? [] : await listCommunes(province);
  return (
    <PropertyForm
      propertyId={property.id}
      initial={property.values}
      provinces={provinces}
      initialCommunes={communes}
      otherCodes={codes}
      cancelHref={next}
      wizardNext={next}
    />
  );
}
