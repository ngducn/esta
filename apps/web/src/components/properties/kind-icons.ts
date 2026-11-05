import type { PropertyKind, UseMode } from '@esta/core/properties';
import { BedDouble, Building, Building2, Hammer, Hourglass, Hotel, House, KeyRound, LandPlot, MapPin, Sprout, Store, Users, Warehouse, type LucideIcon } from 'lucide-react';

export const kindIcons = {
  townhouse: House,
  apartment: Building2,
  villa: Hotel,
  rooming_house: BedDouble,
  commercial_space: Store,
  warehouse: Warehouse,
  residential_land: LandPlot,
  agricultural_land: Sprout,
  mixed: Building,
  other: MapPin,
} as const satisfies Record<PropertyKind, LucideIcon>;

export const useModeIcons = {
  rental: KeyRound,
  owner_occupied: House,
  family_use: Users,
  own_business: Store,
  held: Hourglass,
  under_renovation: Hammer,
} as const satisfies Record<UseMode, LucideIcon>;
