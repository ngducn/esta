import type { Nodes } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';

/**
 * Text as a reader takes it in: NFC, invisible code points removed, and every space, tab and line break one space,
 * so `25` and `triệu` on two lines read as `25 triệu`.
 */
export function readableText(text: string): string {
  return text.normalize('NFC').replace(/\p{Default_Ignorable_Code_Point}/gu, '').replace(/\p{White_Space}+/gu, ' ').trim();
}

/** micromark turns a NUL in the source into U+FFFD, so none is left in the text. */
const BREAK = '\u0000';
const BLOCKS = new Set(['paragraph', 'heading', 'blockquote', 'list', 'listItem', 'code', 'html', 'thematicBreak']);

function visible(node: Nodes, out: string[]): void {
  switch (node.type) {
    case 'text':
    case 'inlineCode':
    case 'code':
    case 'html':
      out.push(node.value);
      return;
    case 'break':
      out.push(' ');
      return;
    case 'image':
    case 'imageReference':
    case 'definition':
      return;
    case 'list':
      node.children.forEach((item, index) => {
        if (node.ordered === true && (node.start ?? 1) !== 1) out.push(`${BREAK}${(node.start ?? 1) + index}.`);
        visible(item, out);
      });
      return;
    default:
      if (!('children' in node)) return;
      if (BLOCKS.has(node.type)) out.push(BREAK);
      for (const child of node.children) visible(child, out);
      if (BLOCKS.has(node.type)) out.push(BREAK);
  }
}

/**
 * The text `SafeMarkdown` puts on screen for `markdown`, one entry per block: react-markdown 10 over the same parser,
 * with raw HTML shown as its literal text, images dropped, links as their text, and an ordered list's numbers when it
 * does not start at 1. A soft or hard line break stays inside its block, so `25` and `triệu` on two lines join.
 */
export function onScreenText(markdown: string): string[] {
  const out: string[] = [];
  visible(fromMarkdown(markdown), out);
  return out
    .join('')
    .split(BREAK)
    .map(readableText)
    .filter((block) => block !== '');
}
