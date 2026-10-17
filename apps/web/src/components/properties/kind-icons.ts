import type { PropertyKind } from '@esta/core/properties';
import { BedDouble, Building, Building2, Hotel, House, LandPlot, MapPin, Sprout, Store, Warehouse, type LucideIcon } from 'lucide-react';

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
