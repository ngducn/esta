import { oklchHex } from '@/design/contrast';
import { colors, type ColorToken, type Theme } from '@/design/tokens';

/** SPEC D10. Both names confirmed on openfreemap.org and at `tiles.openfreemap.org/styles/<name>` on 2026-10-17. */
export const MAP_STYLES = { light: 'positron', dark: 'dark' } as const satisfies Record<Theme, string>;

export const FALLBACK_STYLE = MAP_STYLES.light;

export function mapStyleUrl(name: (typeof MAP_STYLES)[Theme]): string {
  return `https://tiles.openfreemap.org/styles/${name}`;
}

/** WebGL layers and terra-draw take hex strings, so map colors are derived from the same tokens the CSS uses. */
export function tokenHex(token: ColorToken, theme: Theme): `#${string}` {
  return oklchHex(colors[token][theme]);
}

/** Southern Vietnam, where most of a family's properties sit; used only before any pin fits the view. */
export const DEFAULT_VIEW = { center: [106.7, 10.8] as [number, number], zoom: 7 };

export const LOCATE_ZOOM = 16;
