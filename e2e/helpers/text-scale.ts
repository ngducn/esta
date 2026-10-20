import type { Page } from '@playwright/test';

/** Text that a box cuts, that spills out of the box it sits in, runs off the screen or breaks inside a word, as FND-8 counts it. */
export type ClippedText = { readonly text: string; readonly in: string; readonly by: string; readonly px: number };

/**
 * Every run of text on the page that a box cuts off, that spills out of the box it sits in, or that runs past the
 * screen's edge, without the ellipsis or line clamp that says it goes on, and every word split across two lines (FND-8). Text a box scrolls to is not cut,
 * since scrolling shows it; the page's own sideways scroll is `noSidewaysScroll`'s to check. A glyph's box is taller
 * than a tight line, so up to 0.4 em above or below a box is the font's own ascent and descent, not a cut line.
 */
export function clippedText(page: Page): Promise<ClippedText[]> {
  return page.evaluate(() => {
    const name = (element: Element): string => {
      const owner = element.closest('[data-testid]');
      const tag = element.tagName.toLowerCase();
      if (owner === null) return tag;
      const id = `[data-testid="${owner.getAttribute('data-testid')}"]`;
      return owner === element ? id : `${id} ${tag}`;
    };
    const marked = (style: CSSStyleDeclaration) => style.textOverflow === 'ellipsis' || style.webkitLineClamp !== 'none';
    const scrolls = (overflow: string) => overflow === 'auto' || overflow === 'scroll';
    type Edges = { left: number; right: number; top: number; bottom: number };
    const found: { text: string; in: string; by: string; px: number }[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = node.textContent?.trim() ?? '';
      const parent = node.parentElement;
      if (text === '' || parent === null || parent.closest('[aria-hidden="true"], script, style, template, noscript') !== null) continue;
      const style = getComputedStyle(parent);
      if (style.visibility === 'hidden') continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
      let block = parent;
      while (block.parentElement !== null && ['inline', 'contents'].includes(getComputedStyle(block).display)) block = block.parentElement;
      if (rects.length === 0) continue;
      const slack = Number.parseFloat(style.fontSize) * 0.4;
      const beyond = (edges: Edges) => ({
        x: Math.max(...rects.map((rect) => Math.max(edges.left - rect.left, rect.right - edges.right))),
        y: Math.max(...rects.map((rect) => Math.max(edges.top - rect.top, rect.bottom - edges.bottom))) - slack,
      });
      const report = (box: Element, px: number) => found.push({ text: text.slice(0, 60), in: name(parent), by: name(box), px: Math.round(px) });
      let ellipsis = marked(style);
      let scrolled = { x: false, y: false };
      let done = false;
      for (let box: HTMLElement | null = parent; box !== null && box !== document.body && !done; box = box.parentElement) {
        const boxStyle = getComputedStyle(box);
        ellipsis ||= marked(boxStyle);
        if (ellipsis) break;
        if (boxStyle.display === 'contents') continue;
        const outer = box.getBoundingClientRect();
        const cuts = boxStyle.overflowX !== 'visible' || boxStyle.overflowY !== 'visible';
        // Screen reader text sits in a 1 px box that cuts it on purpose.
        if (cuts && (outer.width <= 1 || outer.height <= 1)) {
          done = true;
          break;
        }
        const edges = cuts
          ? { left: outer.left + box.clientLeft, top: outer.top + box.clientTop, right: outer.left + box.clientLeft + box.clientWidth, bottom: outer.top + box.clientTop + box.clientHeight }
          : outer;
        if (!cuts && box !== block) continue;
        const over = beyond(edges);
        const x = over.x > 1 && !scrolled.x && !scrolls(boxStyle.overflowX);
        const y = over.y > 1 && !scrolled.y && !scrolls(boxStyle.overflowY);
        if (x || y) {
          report(box, Math.max(x ? over.x : 0, y ? over.y : 0));
          done = true;
        }
        scrolled = { x: scrolled.x || (over.x > 1 && scrolls(boxStyle.overflowX)), y: scrolled.y || (over.y > 1 && scrolls(boxStyle.overflowY)) };
      }
      if (done || ellipsis || scrolled.x) continue;
      const offScreen = beyond({ left: 0, right: document.documentElement.clientWidth, top: Number.NEGATIVE_INFINITY, bottom: Number.POSITIVE_INFINITY }).x;
      if (offScreen > 1) report(document.documentElement, offScreen);
      // A word too wide for its box breaks across lines rather than spilling; a link or a code has no such word.
      for (const word of (node.textContent ?? '').matchAll(/(?<=^|\s)[\p{L}\p{M}]{2,}(?=[.,:;!?)]*(?:\s|$))/gu)) {
        const part = document.createRange();
        part.setStart(node, word.index);
        part.setEnd(node, word.index + word[0].length);
        const lines = new Set([...part.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top)));
        if (lines.size > 1) found.push({ text: word[0], in: name(parent), by: 'a line break inside the word', px: lines.size });
      }
    }
    // Boxes in the flow sit side by side or stacked; two that overlap mean one has grown out of its column. A sticky
    // bar rides over the content on purpose.
    const inFlow = (element: Element) => {
      const style = getComputedStyle(element);
      return !['absolute', 'fixed', 'sticky'].includes(style.position) && style.display !== 'none' && style.visibility !== 'hidden' && (element.textContent ?? '').trim() !== '';
    };
    for (const box of document.body.querySelectorAll('*')) {
      const children = [...box.children].filter(inFlow).map((child) => ({ child, rect: child.getBoundingClientRect() }));
      for (const [i, a] of children.entries()) {
        for (const b of children.slice(i + 1)) {
          const x = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
          const y = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
          if (x > 1 && y > 1) found.push({ text: (a.child.textContent ?? '').trim().slice(0, 60), in: name(a.child), by: `${name(b.child)}, which it overlaps`, px: Math.round(x) });
        }
      }
    }
    return found;
  });
}
