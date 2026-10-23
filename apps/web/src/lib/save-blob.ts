/** Saves a file the page already holds through the browser's download, as a link with `download` would. */
export function saveBlob(blob: Blob, file: string): void {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: file }).click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
