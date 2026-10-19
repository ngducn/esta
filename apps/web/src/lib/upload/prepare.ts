import { DOCUMENT_MIME_TYPES, MAX_DOCUMENT_BYTES } from '@esta/core/documents';
import type { CombinedCapture } from '@/components/documents/multi-page-capture';
import type { UploadTicket } from '@/server/documents/actions';
import { makePreviews, type Previews } from './previews';
import { sha256 } from './sha256';
import { uploadWithProgress, type UploadProgress } from './upload-with-progress';

/** `captured` marks a PDF combined from photos taken in this tab, which exist nowhere else until it is saved. */
export type Prepared = { readonly file: File; readonly sha256: string; readonly previews: Previews; readonly captured: boolean };
export type FileProblem = 'tooLarge' | 'wrongType' | 'unreadable' | 'fileRequired' | null;

export const ACCEPT = DOCUMENT_MIME_TYPES.join(',');

/** Size and type are checked here, before any request, so a 30 MB photo never reaches the network (DOC-1). */
export function checkFile(file: File): FileProblem {
  if (file.size > MAX_DOCUMENT_BYTES) return 'tooLarge';
  return (DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type) ? null : 'wrongType';
}

/** The combined PDF, with its previews drawn from the page 1 photo rather than by rendering the PDF again. */
export async function prepareCapture({ pdf, firstPage, pageCount }: CombinedCapture): Promise<Prepared | null> {
  try {
    const [digest, previews] = await Promise.all([sha256(pdf), makePreviews(firstPage)]);
    return { file: pdf, sha256: digest, previews: { ...previews, pageCount }, captured: true };
  } catch {
    return null;
  }
}

export async function prepareFile(file: File): Promise<Prepared | null> {
  try {
    const [digest, previews] = await Promise.all([sha256(file), makePreviews(file)]);
    return { file, sha256: digest, previews, captured: false };
  } catch {
    return null;
  }
}

/** Sends the file, then its thumbnail and review copy, to the paths the ticket signed. Progress counts the file only. */
export async function sendPrepared(
  ticket: Extract<UploadTicket, { ok: true }>,
  prepared: Prepared,
  onProgress: (progress: UploadProgress) => void,
): Promise<void> {
  await uploadWithProgress(ticket.file.url, prepared.file, onProgress);
  await Promise.all([uploadWithProgress(ticket.thumb.url, prepared.previews.thumb), uploadWithProgress(ticket.review.url, prepared.previews.review)]);
}
