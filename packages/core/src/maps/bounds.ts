import type { LatLng } from './parse-maps-url';

/** DOMAIN-VN §9: Vietnam's rough bounding box, used only to warn. */
export const VIETNAM_BOUNDS = { minLat: 8, maxLat: 24, minLng: 102, maxLng: 110 } as const;

export function isInVietnam({ lat, lng }: LatLng): boolean {
  return (
    lat >= VIETNAM_BOUNDS.minLat && lat <= VIETNAM_BOUNDS.maxLat && lng >= VIETNAM_BOUNDS.minLng && lng <= VIETNAM_BOUNDS.maxLng
  );
}
