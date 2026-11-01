import localFont from 'next/font/local';

// Its own file so only the routes that import it (the pages before the app) load the face: the root layout's
// fonts.ts would put it on every route.
export const interDisplay = localFont({
  src: '../fonts/InterDisplay-Variable.woff2',
  weight: '300 500',
  display: 'swap',
  variable: '--font-inter-display',
  fallback: ['sans-serif'],
});
