import type { MetadataRoute } from 'next';
import { oklchToSrgb255 } from '@/design/contrast';
import { colors, type Oklch } from '@/design/tokens';

const hex = (color: Oklch) => `#${oklchToSrgb255(color).map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** Mẹ installs Esta to the home screen (SPEC D1); `pnpm icons:build` draws the icons from the brand mark. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Esta',
    short_name: 'Esta',
    lang: 'vi',
    start_url: '/',
    display: 'standalone',
    background_color: hex(colors.ground.light),
    theme_color: hex(colors.surface.light),
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
