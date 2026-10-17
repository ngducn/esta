import type { GeoPoint } from '@esta/core/maps';
import type { PropertyKind } from '@esta/core/properties';

/** One property as the map view shows it, translated and signed on the server. */
export type MapProperty = {
  readonly id: string;
  readonly nickname: string;
  readonly kind: PropertyKind;
  readonly address: string;
  readonly photoUrl: string | null;
  readonly location: GeoPoint | null;
};

/** The property whose location panel is open, with its saved boundary as open-ring vertices. */
export type LocateTarget = { readonly id: string; readonly boundary: readonly GeoPoint[] | null };

export type DrawMode = 'off' | 'draw' | 'edit';
