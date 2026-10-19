import type { DocumentMimeType } from './categories';

type Mark = readonly [offset: number, bytes: readonly number[]];

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

/** Each type the vault takes, by the bytes its files hold at fixed offsets. */
const SIGNATURES: readonly { readonly mime: DocumentMimeType; readonly marks: readonly Mark[] }[] = [
  { mime: 'application/pdf', marks: [[0, ascii('%PDF-')]] },
  { mime: 'image/jpeg', marks: [[0, [0xff, 0xd8, 0xff]]] },
  { mime: 'image/png', marks: [[0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]]] },
  {
    mime: 'image/webp',
    marks: [
      [0, ascii('RIFF')],
      [8, ascii('WEBP')],
    ],
  },
];

/**
 * The document type a file's first bytes declare, or null for one the vault does not take. A browser names the type
 * of a picked file; a file read from disk names none, and its extension can lie.
 */
export function sniffDocumentMime(head: Uint8Array): DocumentMimeType | null {
  const holds = ([offset, bytes]: Mark) => bytes.every((byte, index) => head[offset + index] === byte);
  return SIGNATURES.find(({ marks }) => marks.every(holds))?.mime ?? null;
}
