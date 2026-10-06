import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isLiteralElement,
  isPluralElement,
  isPoundElement,
  isSelectElement,
  isTagElement,
  parse,
  type MessageFormatElement,
} from '@formatjs/icu-messageformat-parser';

export type Catalog = { file: string; messages: unknown };

type Flattened = { placeholders: Map<string, string[] | null>; problems: string[] };

function placeholderNames(elements: MessageFormatElement[], into: Set<string>): Set<string> {
  for (const element of elements) {
    if (isLiteralElement(element) || isPoundElement(element)) continue;
    if (isTagElement(element)) {
      into.add(`<${element.value}>`);
      placeholderNames(element.children, into);
      continue;
    }
    into.add(`{${element.value}}`);
    if (isPluralElement(element) || isSelectElement(element)) {
      for (const option of Object.values(element.options)) placeholderNames(option.value, into);
    }
  }
  return into;
}

function flatten({ file, messages }: Catalog): Flattened {
  const placeholders = new Map<string, string[] | null>();
  const problems: string[] = [];
  const walk = (node: unknown, path: string): void => {
    if (typeof node === 'string') {
      try {
        placeholders.set(path, [...placeholderNames(parse(node), new Set())].sort());
      } catch (error) {
        placeholders.set(path, null);
        problems.push(`${file}: ${path} is not a valid ICU message (${String(error)})`);
      }
    } else if (typeof node === 'object' && node !== null && !Array.isArray(node)) {
      for (const [key, child] of Object.entries(node)) walk(child, path ? `${path}.${key}` : key);
    } else {
      placeholders.set(path, null);
      problems.push(`${file}: ${path || '(root)'} must be a string or a group of messages`);
    }
  };
  walk(messages, '');
  return { placeholders, problems };
}

export function parityProblems(a: Catalog, b: Catalog): string[] {
  const left = flatten(a);
  const right = flatten(b);
  const problems = [...left.problems, ...right.problems];
  for (const [key, leftNames] of left.placeholders) {
    const rightNames = right.placeholders.get(key);
    if (rightNames === undefined) {
      problems.push(`${b.file} is missing ${key}, which ${a.file} has`);
    } else if (leftNames && rightNames && leftNames.join() !== rightNames.join()) {
      const list = (names: string[]) => names.join(' ') || 'no placeholders';
      problems.push(`${key}: ${a.file} uses ${list(leftNames)}, ${b.file} uses ${list(rightNames)}`);
    }
  }
  for (const key of right.placeholders.keys()) {
    if (!left.placeholders.has(key)) problems.push(`${a.file} is missing ${key}, which ${b.file} has`);
  }
  return problems;
}

if (import.meta.main) {
  const dir = join(import.meta.dirname, '../apps/web/messages');
  const read = (file: string): Catalog => ({ file, messages: JSON.parse(readFileSync(join(dir, file), 'utf8')) });
  const problems = parityProblems(read('vi.json'), read('en.json'));
  if (problems.length > 0) {
    console.error(`i18n parity failed for apps/web/messages:\n${problems.map((p) => `  ${p}`).join('\n')}`);
    process.exit(1);
  }
  console.log('i18n parity: vi.json and en.json match');
}
