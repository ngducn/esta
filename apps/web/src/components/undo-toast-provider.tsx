'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { ToastHost } from './undo-toast';

/** The screen's toast where an intl provider with `components.toast` is already mounted around it. */
export function UndoToastProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('components.toast');
  return <ToastHost labels={{ region: t('region'), undo: t('undo') }}>{children}</ToastHost>;
}
