declare class TextEncoder {
  encode(input: string): Uint8Array;
}

declare module 'node:crypto' {
  export function createHash(algorithm: 'sha256'): {
    update(data: string, encoding: 'utf8'): { digest(encoding: 'hex'): string };
  };
}
