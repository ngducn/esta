import { describe, expect, it } from 'vitest';
import { sniffDocumentMime } from './sniff';

const bytes = (...parts: (string | number[])[]) => Uint8Array.from(parts.flatMap((part) => (typeof part === 'string' ? [...part].map((char) => char.charCodeAt(0)) : part)));

describe('sniffDocumentMime', () => {
  it.each([
    ['a PDF', bytes('%PDF-1.7\n'), 'application/pdf'],
    ['a JPEG', bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), 'image/jpeg'],
    ['a PNG', bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]), 'image/png'],
    ['a WebP', bytes('RIFF', [0x24, 0, 0, 0], 'WEBPVP8 '), 'image/webp'],
  ] as const)('reads %s from its first bytes', (_name, head, mime) => {
    expect(sniffDocumentMime(head)).toBe(mime);
  });

  it.each([
    ['a spreadsheet', bytes('PK', [3, 4, 20, 0])],
    ['a WAV, which is RIFF but not WebP', bytes('RIFF', [0x24, 0, 0, 0], 'WAVEfmt ')],
    ['text named .pdf', bytes('Demo %PDF-')],
    ['an empty file', bytes()],
  ] as const)('takes no type from %s', (_name, head) => {
    expect(sniffDocumentMime(head)).toBeNull();
  });
});
