export type ScreenPoint = { readonly x: number; readonly y: number };

/** Pins whose touch targets would overlap on screen, shown as one marker; a group of one is a plain pin. */
export type PinGroup<P> = { readonly key: string; readonly pins: readonly P[]; readonly lat: number; readonly lng: number };

/** Greedy grouping: each pin joins the first group whose first pin lies within `radius` pixels, else starts a group. */
export function groupPins<P extends { readonly id: string; readonly lat: number; readonly lng: number }>(
  pins: readonly P[],
  project: (pin: P) => ScreenPoint,
  radius: number,
): PinGroup<P>[] {
  const groups: { anchor: ScreenPoint; pins: P[] }[] = [];
  for (const pin of pins) {
    const at = project(pin);
    const near = groups.find(({ anchor }) => Math.hypot(anchor.x - at.x, anchor.y - at.y) < radius);
    if (near === undefined) groups.push({ anchor: at, pins: [pin] });
    else near.pins.push(pin);
  }
  return groups.map(({ pins: members }) => {
    const [only] = members;
    if (members.length === 1 && only !== undefined) return { key: only.id, pins: members, lat: only.lat, lng: only.lng };
    return {
      key: `group:${members.map(({ id }) => id).join(',')}`,
      pins: members,
      lat: members.reduce((sum, { lat }) => sum + lat, 0) / members.length,
      lng: members.reduce((sum, { lng }) => sum + lng, 0) / members.length,
    };
  });
}

/** World pixels of a point in MapLibre's 512 px Web Mercator at `zoom`; distances between them are screen distances. */
export function worldPixels({ lat, lng }: { readonly lat: number; readonly lng: number }, zoom: number): ScreenPoint {
  const size = 512 * 2 ** zoom;
  const phi = (lat * Math.PI) / 180;
  return { x: (size * (lng + 180)) / 360, y: (size * (1 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / Math.PI)) / 2 };
}
