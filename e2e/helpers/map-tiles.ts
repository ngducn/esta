import type { Page } from '@playwright/test';

export const TILE_HOST = 'https://tiles.openfreemap.org/';

/** No CI run depends on OpenFreeMap: each style is a stub with one vector layer, so a tile is still requested, and each tile is empty. */
export async function stubTiles(page: Page): Promise<string[]> {
  const styles: string[] = [];
  await page.route(`${TILE_HOST}**`, async (route) => {
    const url = new URL(route.request().url());
    const style = /^\/styles\/([a-z]+)$/.exec(url.pathname)?.[1];
    if (style === undefined) return route.fulfill({ status: 200, contentType: 'application/x-protobuf', body: Buffer.alloc(0) });
    styles.push(style);
    return route.fulfill({
      json: {
        version: 8,
        name: `stub-${style}`,
        sources: { openmaptiles: { type: 'vector', tiles: [`${TILE_HOST}planet/stub/{z}/{x}/{y}.pbf`], maxzoom: 14 } },
        layers: [
          { id: 'background', type: 'background', paint: { 'background-color': style === 'dark' ? '#202228' : '#f2f3f5' } },
          { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', paint: { 'fill-color': '#9fb8d6' } },
        ],
      },
    });
  });
  return styles;
}
