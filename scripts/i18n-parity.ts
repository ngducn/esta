import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isArgumentElement,
  isDateElement,
  isNumberElement,
  isPluralElement,
  isSelectElement,
  isTagElement,
  isTimeElement,
  parse,
  type MessageFormatElement,
  type PluralElement,
} from '@formatjs/icu-messageformat-parser';

export type Catalog = { locale: string; file: string; messages: unknown };

type Flattened = { shapes: Map<string, string[] | null>; problems: string[] };

const isExactMatch = (option: string) => option.startsWith('=');

function pluralCategoryProblems(element: PluralElement, catalog: Catalog, path: string, label: string): string[] {
  const expected = new Intl.PluralRules(catalog.locale, { type: element.pluralType }).resolvedOptions().pluralCategories;
  const used = Object.keys(element.options).filter((option) => !isExactMatch(option));
  return [
    ...used
      .filter((category) => !expected.includes(category as Intl.LDMLPluralRule))
      .map((category) => `${catalog.file}: ${path} ${label} has category ${category}, which ${catalog.locale} never selects`),
    ...expected
      .filter((category) => !used.includes(category))
      .map((category) => `${catalog.file}: ${path} ${label} lacks the ${catalog.locale} category ${category}`),
  ];
}

function collectShape(
  elements: MessageFormatElement[],
  catalog: Catalog,
  path: string,
  shape: Set<string>,
  problems: string[],
): void {
  for (const element of elements) {
    if (isTagElement(element)) {
      shape.add(`<${element.value}>`);
      collectShape(element.children, catalog, path, shape, problems);
    } else if (isArgumentElement(element)) {
      shape.add(`{${element.value}}`);
    } else if (isNumberElement(element)) {
      shape.add(`{${element.value}, number}`);
    } else if (isDateElement(element)) {
      shape.add(`{${element.value}, date}`);
    } else if (isTimeElement(element)) {
      shape.add(`{${element.value}, time}`);
    } else if (isSelectElement(element)) {
      shape.add(`{${element.value}, select, ${Object.keys(element.options).sort().join('|')}}`);
      for (const option of Object.values(element.options)) collectShape(option.value, catalog, path, shape, problems);
    } else if (isPluralElement(element)) {
      const kind = element.pluralType === 'ordinal' ? 'selectordinal' : 'plural';
      const exact = Object.keys(element.options).filter(isExactMatch).sort();
      shape.add(`{${element.value}, ${kind}${exact.length > 0 ? `, ${exact.join('|')}` : ''}}`);
      problems.push(...pluralCategoryProblems(element, catalog, path, `{${element.value}, ${kind}}`));
      for (const option of Object.values(element.options)) collectShape(option.value, catalog, path, shape, problems);
    }
  }
}

function flatten(catalog: Catalog): Flattened {
  const { file } = catalog;
  const shapes = new Map<string, string[] | null>();
  const problems: string[] = [];
  const walk = (node: unknown, path: string): void => {
    if (typeof node === 'string') {
      if (node.trim() === '') problems.push(`${file}: ${path} is empty`);
      if (node !== node.normalize('NFC')) problems.push(`${file}: ${path} is not NFC normalized`);
      try {
        const shape = new Set<string>();
        collectShape(parse(node), catalog, path, shape, problems);
        shapes.set(path, [...shape].sort());
      } catch (error) {
        shapes.set(path, null);
        problems.push(`${file}: ${path} is not a valid ICU message (${String(error)})`);
      }
    } else if (typeof node === 'object' && node !== null && !Array.isArray(node)) {
      const entries = Object.entries(node);
      if (entries.length === 0) problems.push(`${file}: ${path || '(root)'} is an empty group`);
      for (const [key, child] of entries) {
        if (key === '' || key.includes('.')) {
          problems.push(`${file}: key "${key}" under ${path || '(root)'} must be non-empty and contain no dot`);
        }
        walk(child, path ? `${path}.${key}` : key);
      }
    } else {
      shapes.set(path, null);
      problems.push(`${file}: ${path || '(root)'} must be a string or a group of messages`);
    }
  };
  walk(catalog.messages, '');
  return { shapes, problems };
}

export function parityProblems(a: Catalog, b: Catalog): string[] {
  const left = flatten(a);
  const right = flatten(b);
  const problems = [...left.problems, ...right.problems];
  for (const [key, leftShape] of left.shapes) {
    const rightShape = right.shapes.get(key);
    if (rightShape === undefined) {
      problems.push(`${b.file} is missing ${key}, which ${a.file} has`);
    } else if (leftShape && rightShape && leftShape.join() !== rightShape.join()) {
      const list = (shape: string[]) => shape.join(' ') || 'no placeholders';
      problems.push(`${key}: ${a.file} uses ${list(leftShape)}, ${b.file} uses ${list(rightShape)}`);
    }
  }
  for (const key of right.shapes.keys()) {
    if (!left.shapes.has(key)) problems.push(`${a.file} is missing ${key}, which ${b.file} has`);
  }
  return problems;
}

if (import.meta.main) {
  const dir = join(import.meta.dirname, '../apps/web/messages');
  const read = (locale: string): Catalog => {
    const file = `${locale}.json`;
    return { locale, file, messages: JSON.parse(readFileSync(join(dir, file), 'utf8')) };
  };
  const problems = parityProblems(read('vi'), read('en'));
  if (problems.length > 0) {
    console.error(`i18n parity failed for apps/web/messages:\n${problems.map((p) => `  ${p}`).join('\n')}`);
    process.exit(1);
  }
  console.log('i18n parity: vi.json and en.json match');
}
