'use client';

import { Suspense, useRef, useState, type ExoticComponent, type RefObject } from 'react';

type DeferredDialog = {
  /** Null until the first open: render the lazy popup only once this is a boolean, so its module loads on demand. */
  open: boolean | null;
  setOpen: (open: boolean) => void;
  /** Counts the openings, so a popup keyed by it starts from fresh state each time and keeps its exit motion while it closes. */
  openings: number;
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
 * so a `Dialog.Trigger` on the page would ship the whole popup in the initial JS. `initialOpen` opens it on arrival.
 */
export function useDeferredDialog(load: () => Promise<unknown>, initialOpen = false): DeferredDialog {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpenState] = useState<boolean | null>(initialOpen ? true : null);
  const [openings, setOpenings] = useState(initialOpen ? 1 : 0);
  const preload = () => void load();
  const setOpen = (next: boolean) => {
    setOpenState(next);
    if (next) setOpenings((count) => count + 1);
  };
  return {
    open,
    setOpen,
    openings,
    triggerProps: { ref, 'aria-haspopup': 'dialog', 'aria-expanded': open === true, onPointerEnter: preload, onFocus: preload, onClick: () => setOpen(true) },
  };
}

/** What a lazy popup takes from `DeferredPopup`; `finalFocus` returns focus to the button that opened it. */
export type PopupProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finalFocus: RefObject<HTMLButtonElement | null>;
};

/** Mounts a lazy popup for `dialog` once it has been opened, and keeps it mounted so the exit motion runs. */
export function DeferredPopup<Own extends object>({ dialog, popup: Popup, props }: { dialog: DeferredDialog; popup: ExoticComponent<PopupProps & Own>; props: Own }) {
  if (dialog.open === null) return null;
  return (
    <Suspense fallback={null}>
      <Popup key={dialog.openings} open={dialog.open} onOpenChange={dialog.setOpen} finalFocus={dialog.triggerProps.ref} {...props} />
    </Suspense>
  );
}
