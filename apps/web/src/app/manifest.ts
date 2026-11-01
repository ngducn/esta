import type { MetadataRoute } from 'next';
import { colors } from '@/design/tokens';

/** Mẹ installs Esta to the home screen (SPEC D1); `pnpm icons:build` draws the icons from the brand mark. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Esta',
    short_name: 'Esta',
    lang: 'vi',
    start_url: '/',
    display: 'standalone',
    background_color: colors.bg.light,
    theme_color: colors.surface.light,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
