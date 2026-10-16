declare class URLSearchParams {
  get(name: string): string | null;
}

declare class URL {
  constructor(input: string, base?: string | URL);
  readonly href: string;
  readonly protocol: string;
  readonly hostname: string;
  readonly pathname: string;
  readonly searchParams: URLSearchParams;
}
