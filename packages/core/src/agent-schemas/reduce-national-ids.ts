/** A key that holds an ID number by name, such as `id_last4`, `id_number` or `cccd`. */
const ID_KEY = /(?:^|_)(?:id|cccd|cmnd|cmtnd)(?:_|$)/i;

/** A 9-digit CMND or a 12-digit CCCD after its label, the digits possibly grouped by spaces, dots or dashes. */
const LABELLED_ID = /(cccd|cmnd|cmtnd|căn cước(?: công dân)?|chứng minh nhân dân|số định danh(?: cá nhân)?)([^\d\n]{0,24})(\d(?:[ .-]?\d){8,13})(?!\d)/giu;

const ID_DIGITS = new Set([9, 12]);

type Found = { readonly last4: string };

const digitsOf = (text: string) => text.replace(/\D/g, '');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLeaf(value: unknown): value is Record<string, unknown> & { value: unknown } {
  return isRecord(value) && 'value' in value && 'confidence' in value;
}

function reduceText(text: string, idField: boolean, found: Found[]): string {
  if (idField) {
    const digits = digitsOf(text);
    if (ID_DIGITS.has(digits.length) && /^[\d .-]+$/.test(text.trim())) {
      found.push({ last4: digits.slice(-4) });
      return digits.slice(-4);
    }
  }
  const nfc = text.normalize('NFC');
  let changed = false;
  const reduced = nfc.replace(LABELLED_ID, (match: string, label: string, gap: string, number: string) => {
    const digits = digitsOf(number);
    if (!ID_DIGITS.has(digits.length)) return match;
    changed = true;
    found.push({ last4: digits.slice(-4) });
    return `${label}${gap}${digits.slice(-4)}`;
  });
  return changed ? reduced : text;
}

function reduceNode(node: unknown, key: string, found: Found[]): unknown {
  if (typeof node === 'string') return reduceText(node, ID_KEY.test(key), found);
  if (Array.isArray(node)) return node.map((item) => reduceNode(item, key, found));
  if (!isRecord(node)) return node;
  if (isLeaf(node)) return { ...node, value: reduceNode(node.value, key, found) };

  const inner: Found[] = [];
  const out: Record<string, unknown> = Object.fromEntries(Object.entries(node).map(([childKey, child]) => [childKey, reduceNode(child, childKey, inner)]));
  const idLeaf = out.id_last4;
  const firstFound = inner[0];
  if (isLeaf(idLeaf) && idLeaf.value === null && firstFound !== undefined) {
    out.id_last4 = { ...idLeaf, value: firstFound.last4 };
  }
  found.push(...inner);
  return out;
}

/**
 * Keeps only the last four digits of every national ID number in an extraction, whatever the model returned
 * (AGENT.md §5.1 step 5, SPEC D11). It reduces a 9- or 12-digit number held in an ID field or printed after
 * CCCD, CMND or `số định danh` in any string, and fills an empty `id_last4` beside the text it came from.
 */
export function reduceNationalIds<T>(result: T): T {
  return reduceNode(result, '', []) as T;
}
