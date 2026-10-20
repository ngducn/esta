import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('../apps/web/', import.meta.url));

/** The receipt route renders in a Node function; Vercel allows 250 MB, and the plan's budget is 50 MB (spike S7). */
export const RECEIPT_ROUTE = 'api/invoices/[invoiceId]/receipt';
export const BUDGET_BYTES = 50 * 1024 * 1024;

/** Every file `next build` traced for one route, each counted once however many symlinks reach it. */
export function tracedBytes(distDir: string, route: string): { readonly files: number; readonly bytes: number } {
  const nft = join(distDir, 'server/app', route, 'route.js.nft.json');
  if (!existsSync(nft)) throw new Error(`No trace at ${nft}. Run pnpm build first.`);
  const listed: unknown = JSON.parse(readFileSync(nft, 'utf8'));
  if (typeof listed !== 'object' || listed === null || !('files' in listed) || !Array.isArray(listed.files)) throw new Error(`Unexpected trace format in ${nft}`);
  const real = new Set<string>();
  for (const file of [join(distDir, 'server/app', `${route}/route.js`), ...listed.files.map((file: unknown) => resolve(dirname(nft), String(file)))]) {
    if (!existsSync(file)) continue;
    const target = realpathSync(file);
    if (statSync(target).isFile()) real.add(target);
  }
  return { files: real.size, bytes: [...real].reduce((sum, file) => sum + statSync(file).size, 0) };
}

if (import.meta.main) {
  const distDir = resolve(web, process.env.ESTA_NEXT_DIST_DIR ?? '.next');
  const { files, bytes } = tracedBytes(distDir, RECEIPT_ROUTE);
  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(2)} MB`;
  console.log(`/${RECEIPT_ROUTE}: ${files} files, ${mb(bytes)} uncompressed (budget ${mb(BUDGET_BYTES)})`);
  if (bytes > BUDGET_BYTES) process.exit(1);
}
