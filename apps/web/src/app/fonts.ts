import localFont from 'next/font/local';

// File names and weight ranges match `typefaces` in src/design/tokens.ts, which pnpm glyphs:check reads.
// next/font names each family after its export (sourceSans3, sourceSerif4); a custom font-family
// declaration would rename the @font-face but not the CSS variable, so the face would never apply.
export const sourceSans3 = localFont({
  src: '../fonts/SourceSans3-Variable.woff2',
  weight: '400 700',
  display: 'swap',
  variable: '--font-source-sans-3',
});

export const sourceSerif4 = localFont({
  src: '../fonts/SourceSerif4-Variable.woff2',
  weight: '400 600',
  display: 'swap',
  variable: '--font-source-serif-4',
  adjustFontFallback: 'Times New Roman',
});
