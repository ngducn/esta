import { FULL_SHARE_BP } from '../properties/ownership';
import { PROPERTY_KINDS, type PropertyKind } from '../properties/kinds';
import type { CompletenessCheck } from './types';

const LAND: readonly PropertyKind[] = ['residential_land', 'agricultural_land'];
const exceptApartments = PROPERTY_KINDS.filter((kind) => kind !== 'apartment');

const uploadLink = { path: 'documents', anchor: 'upload' };
const itemLink = (kind: 'parcels' | 'structures', id: string | null, anchor: string) => ({ path: `legal/${kind}/${id ?? 'new'}`, anchor });

/** PRP-6 over the Phase 1 data and the P2-02 documents, as data. Each id is its message key under `completeness.checks`. */
export const COMPLETENESS_CHECKS = [
  {
    id: 'parcelIds',
    weight: 20,
    kinds: exceptApartments,
    passes: (facts) => facts.parcelCount > 0 && facts.parcelWithoutNumberId === null,
    link: (facts) => itemLink('parcels', facts.parcelWithoutNumberId, 'parcel-no'),
  },
  {
    id: 'landArea',
    weight: 20,
    kinds: exceptApartments,
    passes: (facts) => facts.parcelCount > 0 && facts.parcelWithoutAreaId === null,
    link: (facts) => itemLink('parcels', facts.parcelWithoutAreaId, 'parcel-area'),
  },
  {
    id: 'floorArea',
    weight: 20,
    kinds: ['apartment'],
    passes: (facts) => facts.structureCount > 0 && facts.structureWithoutFloorAreaId === null,
    link: (facts) => itemLink('structures', facts.structureWithoutFloorAreaId, 'floor-area'),
  },
  // Ahead of the other weight-10 checks: a certificate photo is what the assistant reads the legal facts from (P2-03).
  { id: 'certificateDocument', weight: 10, kinds: 'all', passes: (facts) => facts.certificateDocumentCount > 0, link: () => uploadLink },
  { id: 'ownersComplete', weight: 15, kinds: 'all', passes: (facts) => facts.shareTotalBp === FULL_SHARE_BP, link: () => ({ path: 'legal', anchor: 'owners' }) },
  { id: 'currentAddress', weight: 10, kinds: 'all', passes: (facts) => facts.hasCurrentAddress, link: () => ({ path: 'edit', anchor: 'current-address' }) },
  { id: 'pin', weight: 10, kinds: 'all', passes: (facts) => facts.hasLocation, link: () => ({ path: '', anchor: 'location' }) },
  { id: 'acquisition', weight: 10, kinds: 'all', passes: (facts) => facts.hasAcquisition, link: () => ({ path: 'edit', anchor: 'acquisition' }) },
  {
    id: 'utilityAccounts',
    weight: 10,
    kinds: PROPERTY_KINDS.filter((kind) => !LAND.includes(kind)),
    passes: (facts) => facts.utilityAccountCount > 0,
    link: () => ({ path: 'rental/accounts/new', anchor: 'account-kind' }),
  },
  { id: 'photo', weight: 5, kinds: 'all', passes: (facts) => facts.photoCount > 0, link: () => uploadLink },
] as const satisfies readonly CompletenessCheck[];

export type CompletenessCheckId = (typeof COMPLETENESS_CHECKS)[number]['id'];
