import { signedUploadHeaders } from '@esta/core/documents';

export type UploadProgress = { readonly loaded: number; readonly total: number };

export class UploadError extends Error {
  constructor(readonly status: number) {
    super(status === 0 ? 'The upload did not reach Storage' : `Storage answered ${status}`);
  }
}

/**
 * PUTs the file to a signed upload URL. XMLHttpRequest rather than fetch, because only its `upload.onprogress`
 * reports bytes sent. The signed URL allows upsert, so a retry rewrites the same path.
 */
export function uploadWithProgress(url: string, file: Blob, onProgress: (progress: UploadProgress) => void = () => {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    for (const [name, value] of Object.entries(signedUploadHeaders(file.type || 'application/octet-stream'))) request.setRequestHeader(name, value);
    request.upload.onprogress = (event) => onProgress({ loaded: event.loaded, total: event.lengthComputable ? event.total : file.size });
    request.onload = () => (request.status >= 200 && request.status < 300 ? resolve() : reject(new UploadError(request.status)));
    request.onerror = () => reject(new UploadError(0));
    request.onabort = () => reject(new UploadError(0));
    request.send(file);
  });
}
