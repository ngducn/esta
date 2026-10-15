'use client';

import { useRef, useState, type RefObject } from 'react';

type DeferredDialog = {
  /** Null until the first open: render the lazy popup only once this is a boolean, so its module loads on demand. */
  open: boolean | null;
  setOpen: (open: boolean) => void;
  /** Spread on the plain `Button` that opens the dialog; hovering or focusing it starts loading the popup module. */
  triggerProps: {
    ref: RefObject<HTMLButtonElement | null>;
    'aria-haspopup': 'dialog';
    'aria-expanded': boolean;
    onPointerEnter: () => void;
    onFocus: () => void;
    onClick: () => void;
  };
};

/**
 * Opens a Base UI dialog whose module loads on demand. Base UI exports each dialog as one namespace,
 * so a `Dialog.Trigger` on the page would ship the whole popup in the initial JS.
 */
export function useDeferredDialog(load: () => Promise<unknown>): DeferredDialog {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState<boolean | null>(null);
  const preload = () => void load();
  return {
    open,
    setOpen,
    triggerProps: { ref, 'aria-haspopup': 'dialog', 'aria-expanded': open === true, onPointerEnter: preload, onFocus: preload, onClick: () => setOpen(true) },
  };
}
