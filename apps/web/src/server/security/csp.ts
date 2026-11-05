import { TILE_HOST } from '@/components/map/map-style';

export type CspOptions = {
  readonly nonce: string;
  readonly supabaseUrl: string;
  readonly tileHost?: string;
  /** `next dev` evaluates strings for React's debugging. */
  readonly development?: boolean;
};

type Directives = Readonly<Record<string, readonly string[]>>;

function socketOrigin(origin: string): string {
  return origin.replace(/^http/, 'ws');
}

export function cspDirectives({ nonce, supabaseUrl, tileHost = TILE_HOST, development = false }: CspOptions): Directives {
  const supabase = new URL(supabaseUrl).origin;
  return {
    'default-src': ["'self'"],
    'script-src': ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(development ? ["'unsafe-eval'"] : [])],
    // React renders `style` attributes, which a nonce cannot cover.
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'blob:', 'data:', supabase, tileHost],
    'font-src': ["'self'"],
    'connect-src': ["'self'", supabase, socketOrigin(supabase), tileHost],
    // read-excel-file's unzip (fflate) starts a blob worker for a sheet of 512 KB or more; `strict-dynamic` and the nonce still gate scripts.
    'worker-src': ["'self'", 'blob:'],
    'frame-ancestors': ["'none'"],
    'base-uri': ["'self'"],
    // A Google sign-in tapped before hydration is a native POST that Supabase redirects to Google, and form-action covers the redirect.
    'form-action': ["'self'", supabase, 'https://accounts.google.com'],
    'object-src': ["'none'"],
  };
}

export function buildCsp(options: CspOptions): string {
  return Object.entries(cspDirectives(options))
    .map(([name, sources]) => `${name} ${sources.join(' ')}`)
    .join('; ');
}
