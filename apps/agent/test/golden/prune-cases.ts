import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/** Removes the recordings these cases wrote before, whatever their key was, so a case whose prompt changed leaves no old key behind. */
export function pruneCaseRecordings(dir: string, ids: readonly string[]): void {
  const folder = join(dir, 'ask');
  const mine = new RegExp(`^Hand-written (?:for|repair turn of) (?:${ids.join('|')})(?:[ ,;.]|$)`, 'u');
  for (const file of readdirSync(folder).filter((name) => name.endsWith('.json'))) {
    const label = (JSON.parse(readFileSync(join(folder, file), 'utf8')) as { label?: string }).label ?? '';
    if (mine.test(label)) rmSync(join(folder, file));
  }
}
