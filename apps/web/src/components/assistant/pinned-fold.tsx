'use client';

import { useEffect, useRef, type ReactNode } from 'react';

export function PinnedFold({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  const band = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const fold = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const [area, section, details] = [band.current, panel.current, fold.current];
    if (area === null || section === null || details === null) return;
    const root = document.documentElement;
    let toggledByHer = false;
    const landAnchorsBelowBand = () => {
      root.style.scrollPaddingTop = `${area.offsetHeight}px`;
    };
    const foldWhenOverflowing = () => {
      if (!toggledByHer && details.open && section.scrollHeight > section.clientHeight) details.open = false;
    };
    const fit = () => {
      landAnchorsBelowBand();
      foldWhenOverflowing();
    };
    const markToggled = () => {
      toggledByHer = true;
    };
    const summaryElement = details.querySelector('summary');
    summaryElement?.addEventListener('click', markToggled);
    const resized = new ResizeObserver(fit);
    resized.observe(section);
    for (const child of details.children) resized.observe(child);
    fit();
    return () => {
      resized.disconnect();
      summaryElement?.removeEventListener('click', markToggled);
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
