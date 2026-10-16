import localFont from 'next/font/local';

// next/font names each family after its export. A font-family in `declarations` renames the
// @font-face but not the CSS variable, so the face would never apply.
export const plusJakartaSans = localFont({
  src: '../fonts/PlusJakartaSans-Variable.woff2',
  weight: '400 700',
  display: 'swap',
  variable: '--font-plus-jakarta-sans',
  fallback: ['sans-serif'],
});
