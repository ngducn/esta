import { formatArea } from '@esta/core/format';
import { getLocale, getTranslations } from 'next-intl/server';
import type { LegalRow } from '@esta/ops';
import { LegalCard } from './legal-card';

export async function StructureList({ propertyId, structures, canEdit }: { propertyId: string; structures: readonly LegalRow<'structures'>[]; canEdit: boolean }) {
  const [t, locale] = await Promise.all([getTranslations('propertyLegal'), getLocale()]);
  return (
    <ul className="flex flex-col gap-3">
      {structures.map((structure) => {
        const facts = [
          structure.floors === null ? null : t('floors', { count: structure.floors }),
          structure.floor_area_m2 === null ? null : t('floorArea', { area: formatArea(structure.floor_area_m2, locale) }),
          structure.footprint_m2 === null ? null : t('footprint', { area: formatArea(structure.footprint_m2, locale) }),
          structure.completed_year === null ? null : t('completed', { year: String(structure.completed_year) }),
        ].filter((fact) => fact !== null);
        return (
          <LegalCard key={structure.id} propertyId={propertyId} kind="structures" itemId={structure.id} name={structure.kind} canEdit={canEdit} title={structure.kind}>
            {facts.length === 0 ? null : (
              <ul className="figures flex flex-wrap gap-x-4 gap-y-1 text-body text-ink-2">
                {facts.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
            )}
            {structure.structure_text === null ? null : <p className="text-small break-words text-ink-2">{structure.structure_text}</p>}
            {structure.certificate_id === null ? <p className="text-small text-ink-muted">{t('notOnCertificate')}</p> : null}
          </LegalCard>
        );
      })}
    </ul>
  );
}
