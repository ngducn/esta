import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const truth = JSON.parse(readFileSync(join(import.meta.dirname, 'ask-ground-truth.json'), 'utf8')) as Array<{ question: string; figure: string; value: string }>;

/** One figure of `ask-ground-truth.sql`, as the golden questions of AGENT.md §7.4 state it. */
export function fact(question: string, figure: string): string {
  const row = truth.find((candidate) => candidate.question === question && candidate.figure === figure);
  if (row === undefined) throw new Error(`ask-ground-truth.sql has no ${question} ${figure}`);
  return row.value;
}
