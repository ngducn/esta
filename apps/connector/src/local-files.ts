import { MAX_DOCUMENT_BYTES, sniffDocumentMime, type DocumentMimeType } from '@esta/core/documents';
import { DOCUMENT_PREVIEWS, pdfPageScale, previewSize } from '@esta/core/documents/previews';
import type { LocalFile, LocalFiles, LocalPreviews } from '@esta/ops';
import { createCanvas } from '@napi-rs/canvas';
import { createHash } from 'node:crypto';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import sharp from 'sharp';
import type { ImportFolders } from './files';

type Page = { readonly image: Buffer; readonly width: number; readonly height: number };

/**
 * A PDF as pdf.js reads it, as the browser does. pdf.js takes the bytes it is given, so it gets a copy, and it stays
 * quiet: stdout carries the MCP protocol.
 */
async function withPdf<T>(bytes: Uint8Array, use: (pdf: Awaited<ReturnType<typeof getDocument>['promise']>) => Promise<T>): Promise<T | null> {
  const task = getDocument({ data: Uint8Array.from(bytes), verbosity: 0 });
  try {
    return await use(await task.promise);
  } catch {
    return null;
  } finally {
    await task.destroy();
  }
}

/** Page 1 drawn with its long side at the review size, as the browser's `makePreviews` draws it. */
const pdfFirstPage = (bytes: Uint8Array) =>
  withPdf(bytes, async (pdf): Promise<Page> => {
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: pdfPageScale(base.width, base.height) });
    const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
    await page.render({ canvas, viewport }).promise;
    return { image: canvas.toBuffer('image/png'), width: canvas.width, height: canvas.height };
  });

/** A photo upright from its EXIF orientation, as `createImageBitmap(file, { imageOrientation: 'from-image' })` reads it. */
async function uprightPhoto(bytes: Uint8Array): Promise<Page> {
  const { data, info } = await sharp(bytes).rotate().png({ compressionLevel: 0 }).toBuffer({ resolveWithObject: true });
  return { image: data, width: info.width, height: info.height };
}

async function previews(file: LocalFile): Promise<LocalPreviews> {
  const page = file.mime === 'application/pdf' ? await pdfFirstPage(file.bytes) : await uprightPhoto(file.bytes);
  if (page === null) throw new Error('The PDF could not be drawn');
  const copy = ({ longSide, quality }: { longSide: number; quality: number }) => {
    const size = previewSize(page.width, page.height, longSide);
    return sharp(page.image).resize(size.width, size.height).webp({ quality }).toBuffer();
  };
  const [thumb, review] = await Promise.all([copy(DOCUMENT_PREVIEWS.thumb), copy(DOCUMENT_PREVIEWS.review)]);
  return { thumb, review };
}

const pageCount = (bytes: Uint8Array, mime: DocumentMimeType) => (mime === 'application/pdf' ? withPdf(bytes, async (pdf) => pdf.numPages) : Promise.resolve(1));

/** Document files from the import folders, read and hashed once, with the same previews the vault makes in a browser. */
export function localFiles(folders: ImportFolders): LocalFiles {
  return {
    async readDocument(path) {
      const read = await folders.read(path, MAX_DOCUMENT_BYTES);
      if (!read.ok) return read;
      const { name, bytes } = read.value;
      const mime = sniffDocumentMime(bytes.subarray(0, 16));
      const pages = mime === null ? null : await pageCount(bytes, mime);
      if (mime === null || pages === null) return { ok: false, reason: { kind: 'file', problem: 'unsupported_type' } };
      return { ok: true, value: { name, bytes, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), mime, pageCount: pages } };
    },
    previews,
  };
}
