import type { IsoDate } from '@esta/core/date';
import type { AcquisitionKind, KindFieldTexts, LegalStatus, PropertyKind, UseMode } from '@esta/core/properties/form';

export type AddressValue = {
  readonly provinceCode: string | null;
  readonly communeCode: string | null;
  readonly communeName: string;
  readonly houseNo: string;
  readonly street: string;
};

export type PropertyFormValues = {
  nickname: string;
  code: string;
  kind: PropertyKind;
  kindTexts: KindFieldTexts;
  useMode: UseMode;
  legalStatus: LegalStatus;
  address: AddressValue;
  certificateAddress: string;
  acquiredOn: IsoDate | null;
  acquisitionKind: AcquisitionKind | null;
  priceText: string;
  notes: string;
};

export const EMPTY_PROPERTY: PropertyFormValues = {
  nickname: '',
  code: '',
  kind: 'townhouse',
  kindTexts: {},
  useMode: 'rental',
  legalStatus: 'certified',
  address: { provinceCode: null, communeCode: null, communeName: '', houseNo: '', street: '' },
  certificateAddress: '',
  acquiredOn: null,
  acquisitionKind: null,
  priceText: '',
  notes: '',
};

/** `/properties?archived=<id>` right after an archive, so the list shows that property's undo toast. */
export const ARCHIVED_PARAM = 'archived';
