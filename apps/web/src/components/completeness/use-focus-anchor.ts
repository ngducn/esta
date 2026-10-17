'use client';

import { useEffect } from 'react';

const FOCUSABLE = 'input:not([type="hidden"]), select, textarea, button, a[href]';

/**
 * Lands a completeness link on its field: scrolls to the element the URL hash names and focuses it, or the first
 * control inside it, or for a section heading such as `#owners` the first control of its section. A form passes
 * `ready` once hydrated, because its fieldset stays disabled until then.
 */
export function useFocusAnchor(ready = true) {
  useEffect(() => {
    if (!ready || window.location.hash.length < 2) return;
    const target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    if (target === null) return;
    const control = target.matches(FOCUSABLE)
      ? target
      : (target.querySelector<HTMLElement>(FOCUSABLE) ?? target.closest('section')?.querySelector<HTMLElement>(FOCUSABLE));
    target.scrollIntoView({ block: 'center' });
    control?.focus({ preventScroll: true });
  }, [ready]);
}

/** For a server page with no form of its own, such as the overview's location card. */
export function FocusAnchor() {
  useFocusAnchor();
  return null;
}
