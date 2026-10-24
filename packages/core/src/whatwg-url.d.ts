declare class URLSearchParams {
  get(name: string): string | null;
}

declare class URL {
  constructor(input: string, base?: string | URL);
  static parse(input: string, base?: string | URL): URL | null;
  readonly href: string;
  readonly protocol: string;
  readonly hostname: string;
  readonly pathname: string;
  readonly port: string;
  readonly search: string;
  readonly searchParams: URLSearchParams;
}
