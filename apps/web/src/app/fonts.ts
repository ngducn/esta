import localFont from 'next/font/local';

// next/font names each family after its export. A font-family in `declarations` renames the
// @font-face but not the CSS variable, so the face would never apply.
export const inter = localFont({
  src: '../fonts/Inter-Variable.woff2',
  weight: '400 600',
  display: 'swap',
  variable: '--font-inter',
  fallback: ['sans-serif'],
});
