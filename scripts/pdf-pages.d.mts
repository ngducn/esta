/** Each page of a PDF drawn as a PNG at `scale` × 72 dpi, as a phone's camera or a printer sees it. */
export function pdfPagePngs(bytes: Uint8Array, scale?: number): Promise<Buffer[]>;
