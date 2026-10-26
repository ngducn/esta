'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * The fold of `Cần xử lý`. It stays at the top of the screen, at most a third of its height, and folds itself when its
 * list would not fit until she opens or folds it herself. Anchors scroll below it, so a note it links to is not hidden
 * under it.
 */
export function PinnedFold({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  const band = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const fold = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const [area, section, details] = [band.current, panel.current, fold.current];
    if (area === null || section === null || details === null) return;
    const root = document.documentElement;
    let chosen = false;
    const fit = () => {
      root.style.scrollPaddingTop = `${area.offsetHeight}px`;
      if (!chosen && details.open && section.scrollHeight > section.clientHeight) details.open = false;
    };
    const choose = () => {
      chosen = true;
    };
    const summaryElement = details.querySelector('summary');
    summaryElement?.addEventListener('click', choose);
    const resized = new ResizeObserver(fit);
    resized.observe(section);
    for (const child of details.children) resized.observe(child);
    fit();
    return () => {
      resized.disconnect();
      summaryElement?.removeEventListener('click', choose);
      root.style.removeProperty('scroll-padding-top');
    };
  }, []);

  return (
    <div ref={band} data-testid="pinned" className="sticky top-0 z-10 max-w-3xl bg-ground py-2">
      <section
        ref={panel}
        aria-labelledby="pinned-heading"
        className="max-h-[calc(100dvh/3-(--spacing(4)))] overflow-y-auto rounded-lg border border-rule bg-surface shadow-card"
      >
        <details ref={fold} open className="group">
          {summary}
          {children}
        </details>
      </section>
    </div>
  );
}
