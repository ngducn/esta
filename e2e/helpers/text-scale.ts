import type { Page } from '@playwright/test';

/** Text cut, spilling, breaking inside a word or sliding under another box, as FND-8 counts it. */
export type ClippedText = { readonly text: string; readonly in: string; readonly by: string; readonly px: number };

/**
 * Every place on the page where text does not fit (FND-8), without the ellipsis or line clamp that says it goes on:
 * - an element whose content is wider than its box (`scrollWidth` past `clientWidth`, the plan's own check), unless the
 *   box, or the strip it sits in, scrolls to show the rest;
 * - text that a box cuts, or that spills out of its block or out of any box that draws a border or a background;
 * - text past the screen's edge, a word of letters split over two lines, a field's placeholder cut by the field;
 * - two boxes in the flow, each holding text, that overlap.
 * Text that is not drawn (no box, `visibility: hidden`, opacity 0, or a 1 px screen-reader box) is not read. Visible
 * text is read even when `aria-hidden` keeps it from screen readers. A glyph's box is taller than a tight line, so up to
 * 0.4 em above or below a box is the font's ascent and descent, not a cut line. The page's own sideways scroll is
 * `noSidewaysScroll`'s to check.
 */
export function clippedText(page: Page): Promise<ClippedText[]> {
  return page.evaluate(() => {
    type Edges = { left: number; right: number; top: number; bottom: number };
    const found: { text: string; in: string; by: string; px: number }[] = [];
    const name = (element: Element): string => {
      const owner = element.closest('[data-testid]');
      const tag = element.tagName.toLowerCase();
      if (owner === null) return tag;
      const id = `[data-testid="${owner.getAttribute('data-testid')}"]`;
      return owner === element ? id : `${id} ${tag}`;
    };
    const scrolls = (overflow: string) => overflow === 'auto' || overflow === 'scroll';
    const marked = (style: CSSStyleDeclaration) =>
      (style.textOverflow === 'ellipsis' && style.overflowX !== 'visible') || (style.webkitLineClamp !== 'none' && style.overflowY !== 'visible');
    const draws = (style: CSSStyleDeclaration) =>
      ['top', 'right', 'bottom', 'left'].some((side) => style.getPropertyValue(`border-${side}-style`) !== 'none' && Number.parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0) ||
      style.backgroundImage !== 'none' ||
      !/^(transparent|rgba\(.*,\s*0\)|.*\/\s*0\))$/.test(style.backgroundColor);
    const unseen = new Map<Element, boolean>();
    const hidden = (element: Element | null): boolean => {
      if (element === null || element === document.documentElement) return false;
      const known = unseen.get(element);
      if (known !== undefined) return known;
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      const srOnly = style.overflowX !== 'visible' && (box.width <= 1 || box.height <= 1);
      const value = style.opacity === '0' || srOnly || hidden(element.parentElement);
      unseen.set(element, value);
      return value;
    };
    const textRects = (node: Node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
    };
    const past = (rects: readonly DOMRect[], edges: Edges, slack = 0) => ({
      x: Math.max(...rects.map((rect) => Math.max(edges.left - rect.left, rect.right - edges.right))),
      y: Math.max(...rects.map((rect) => Math.max(edges.top - rect.top, rect.bottom - edges.bottom))) - slack,
    });
    const paddingBox = (box: Element): Edges => {
      const outer = box.getBoundingClientRect();
      return { left: outer.left + box.clientLeft, top: outer.top + box.clientTop, right: outer.left + box.clientLeft + box.clientWidth, bottom: outer.top + box.clientTop + box.clientHeight };
    };

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = node.textContent?.trim() ?? '';
      const parent = node.parentElement;
      if (text === '' || parent === null || parent.closest('script, style, template, noscript') !== null) continue;
      const style = getComputedStyle(parent);
      const rects = textRects(node);
      if (rects.length === 0 || style.visibility === 'hidden' || hidden(parent)) continue;
      let block = parent;
      while (block.parentElement !== null && ['inline', 'contents'].includes(getComputedStyle(block).display)) block = block.parentElement;
      const slack = Number.parseFloat(style.fontSize) * 0.4;
      const report = (box: Element, px: number) => found.push({ text: text.slice(0, 60), in: name(parent), by: name(box), px: Math.round(px) });
      let ellipsis = marked(style);
      let scrolled = { x: false, y: false };
      let done = false;
      for (let box: HTMLElement | null = parent; box !== null && box !== document.body && !done; box = box.parentElement) {
        const boxStyle = getComputedStyle(box);
        ellipsis ||= marked(boxStyle);
        if (ellipsis) break;
        if (boxStyle.display === 'contents') continue;
        const cuts = boxStyle.overflowX !== 'visible' || boxStyle.overflowY !== 'visible';
        if (!cuts && box !== block && !draws(boxStyle)) continue;
        const over = past(rects, cuts ? paddingBox(box) : box.getBoundingClientRect(), slack);
        const x = over.x > 1 && !scrolled.x && !scrolls(boxStyle.overflowX);
        const y = over.y > 1 && !scrolled.y && !scrolls(boxStyle.overflowY);
        if (x || y) {
          report(box, Math.max(x ? over.x : 0, y ? over.y : 0));
          done = true;
        }
        scrolled = { x: scrolled.x || (over.x > 1 && scrolls(boxStyle.overflowX)), y: scrolled.y || (over.y > 1 && scrolls(boxStyle.overflowY)) };
      }
      if (done || ellipsis || scrolled.x) continue;
      const offScreen = past(rects, { left: 0, right: document.documentElement.clientWidth, top: Number.NEGATIVE_INFINITY, bottom: Number.POSITIVE_INFINITY }).x;
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

    // The plan's check: content wider than its box. A strip that scrolls, inside the box or around it, shows the rest,
    // and a box placed out of the flow sits where it was put.
    for (const box of document.body.querySelectorAll<HTMLElement>('*')) {
      if (box.scrollWidth <= box.clientWidth + 1 || box.clientWidth <= 1 || (box.innerText ?? '').trim() === '' || hidden(box)) continue;
      const style = getComputedStyle(box);
      if (style.visibility === 'hidden' || scrolls(style.overflowX) || marked(style)) continue;
      // As `scrollWidth` counts it: past the end, not a negative margin that pulls a link into the gutter.
      const end = paddingBox(box).right;
      const outside = (rects: readonly DOMRect[]) => rects.some((rect) => rect.right - end > 1);
      const shown = (element: HTMLElement) => {
        for (let up: HTMLElement | null = element; up !== null && up !== box; up = up.parentElement) {
          const upStyle = getComputedStyle(up);
          if (['absolute', 'fixed'].includes(upStyle.position) || (up === element ? scrolls(upStyle.overflowX) : upStyle.overflowX !== 'visible')) return false;
        }
        return true;
      };
      const spills =
        [...box.childNodes].some((child) => child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim() !== '' && outside(textRects(child))) ||
        [...box.querySelectorAll<HTMLElement>('*')].some((element) => shown(element) && outside([element.getBoundingClientRect()].filter((rect) => rect.width > 0)));
      if (!spills) continue;
      let holder = box.parentElement;
      while (holder !== null && holder !== document.body && getComputedStyle(holder).overflowX === 'visible') holder = holder.parentElement;
      if (holder !== null && holder !== document.body && scrolls(getComputedStyle(holder).overflowX)) continue;
      found.push({ text: box.innerText.trim().slice(0, 60), in: name(box), by: 'content wider than its box', px: box.scrollWidth - box.clientWidth });
    }

    // A field's placeholder is the one text a box cuts that no node holds; an empty field must show all of it.
    const measure = document.createElement('canvas').getContext('2d');
    for (const field of document.body.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[placeholder], textarea[placeholder]')) {
      const style = getComputedStyle(field);
      if (field.value !== '' || field.placeholder === '' || style.display === 'none' || style.visibility === 'hidden' || hidden(field) || measure === null) continue;
      measure.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const room = field.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
      // A text area wraps its placeholder over the lines it shows.
      const lines = field instanceof HTMLTextAreaElement ? Math.max(1, Math.floor((field.clientHeight - Number.parseFloat(style.paddingTop) - Number.parseFloat(style.paddingBottom)) / Number.parseFloat(style.lineHeight))) : 1;
      const px = measure.measureText(field.placeholder).width - room * lines;
      if (px > 1 && style.textOverflow !== 'ellipsis') found.push({ text: field.placeholder, in: name(field), by: 'its field', px: Math.round(px) });
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
