import { createHash } from 'node:crypto';

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const MEMO = /\bESTA ?([0-9A-Z]{8})\b/g;
const TIMESTAMP = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})/g;
const PLACEHOLDER = /<(household|id:\d+|memo:\d+|time:\d+)>/g;

/**
 * Maps run-specific values to placeholders before hashing and recording, and back when a recording replays,
 * so one recording serves every household and every run (AGENT.md §8).
 */
export type Canonicalizer = {
  canonical(text: string): string;
  restore(text: string): string;
};

export function canonicalizer({ householdName }: { readonly householdName: string }): Canonicalizer {
  const toPlaceholder = new Map<string, string>();
  const toValue = new Map<string, string>([['<household>', householdName]]);
  const counters = { id: 0, memo: 0, time: 0 };

  const placeholder = (kind: keyof typeof counters, value: string): string => {
    const key = `${kind}:${value}`;
    let name = toPlaceholder.get(key);
    if (name === undefined) {
      counters[kind] += 1;
      name = `<${kind}:${counters[kind]}>`;
      toPlaceholder.set(key, name);
      toValue.set(name, value);
    }
    return name;
  };

  return {
    canonical: (text) =>
      text
        .replaceAll(householdName, '<household>')
        .replace(UUID, (id) => placeholder('id', id.toLowerCase()))
        .replace(MEMO, (_, code: string) => `ESTA ${placeholder('memo', code)}`)
        .replace(TIMESTAMP, (time) => placeholder('time', time)),
    restore: (text) => text.replace(PLACEHOLDER, (name) => toValue.get(name) ?? name),
  };
}

export type CanonicalInput = {
  readonly version: 1;
  readonly kind: string;
  readonly prompt: string;
  readonly builtInTools: string[];
  readonly mcpTools: string[];
  readonly maxTurns: number;
};

export function inputHash(input: CanonicalInput): string {
  const stable = JSON.stringify(input, Object.keys(input).sort());
  return createHash('sha256').update(stable).digest('hex');
}
