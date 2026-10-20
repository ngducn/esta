import { readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

/** A PDF's text as pdf.js extracts it, page by page, one line per text run: what a search or a screen reader gets (LSE-6). */
export async function pdfText(bytes: Uint8Array): Promise<string> {
  const task = getDocument({ data: Uint8Array.from(bytes), verbosity: 0 });
  try {
    const pdf = await task.promise;
    const pages: string[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const content = await (await pdf.getPage(number)).getTextContent();
      pages.push(content.items.flatMap((item) => ('str' in item && item.str.trim() !== '' ? [item.str] : [])).join('\n'));
    }
    return pages.join('\n\n');
  } finally {
    await task.destroy();
  }
}

if (import.meta.main) {
  const path = process.argv[2];
  if (path === undefined) {
    console.error('Usage: pnpm tsx scripts/receipt-text.ts <receipt.pdf>');
    process.exit(2);
  }
  console.log(await pdfText(readFileSync(path)));
}
