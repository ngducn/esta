import type { Nodes } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';

/** micromark turns a NUL in the source into U+FFFD, so none is left in the text to collide with. */
const BREAK = '\u0000';
const BLOCKS = new Set(['paragraph', 'heading', 'blockquote', 'list', 'listItem', 'code', 'html', 'thematicBreak', 'definition']);

/** Words of an attribute such as a title, joined with a space; missing ones add nothing. */
const attributes = (...parts: ReadonlyArray<string | null | undefined>) => parts.filter((part) => part != null && part !== '').join(' ');

type Piece = Nodes | string;

/** Raw HTML inside a paragraph is inline: its text joins the line instead of starting a block. */
const FLOW = new Set(['root', 'blockquote', 'listItem']);
const inline = (children: readonly Nodes[]): Piece[] => children.map((child) => (child.type === 'html' ? child.value : child));

/** A node's output in order: literal text, and child nodes still to expand. */
function pieces(node: Nodes): Piece[] {
  switch (node.type) {
    case 'text':
    case 'inlineCode':
    case 'html':
      return [node.value];
    case 'code':
      return [attributes(node.lang, node.meta), BREAK, node.value];
    case 'break':
      return ['\n'];
    case 'image':
      return [attributes(node.alt, node.title)];
    case 'imageReference':
      return [node.alt ?? ''];
    case 'definition':
      return [node.title ?? ''];
    case 'list':
      return node.children.flatMap((item, index) => (node.ordered === true && (node.start ?? 1) !== 1 ? [BREAK, `${(node.start ?? 1) + index}.`, item] : [item]));
    case 'link':
      return node.title == null ? inline(node.children) : [...inline(node.children), ' ', node.title];
    default:
      if (!('children' in node)) return [];
      return FLOW.has(node.type) ? node.children : inline(node.children);
  }
}

/**
 * What `SafeMarkdown` shows for `markdown`, one block per line, raw (no normalization, invisible characters kept):
 * text, code, raw HTML as its literal text, links as their text, and an ordered list's numbers when it does not
 * start at 1. It also keeps what another renderer may show (image alt text, link and image titles, definition
 * titles, a code fence's info string) and never a URL, which may hold record ids.
 */
export function visibleText(markdown: string): string {
  const out: string[] = [];
  // An explicit stack, because a model can nest quotes and lists deeper than the call stack goes.
  const pending: Piece[] = [fromMarkdown(markdown)];
  for (let piece = pending.pop(); piece !== undefined; piece = pending.pop()) {
    if (typeof piece === 'string') out.push(piece);
    else pending.push(...(BLOCKS.has(piece.type) ? [BREAK, ...pieces(piece), BREAK] : pieces(piece)).reverse());
  }
  return out
    .join('')
    .split(BREAK)
    .filter((block) => block.trim() !== '')
    .join('\n');
}
