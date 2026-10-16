import { Building2, ChartColumn, FileText, House, NotebookPen, SlidersHorizontal, Wallet, type LucideIcon } from 'lucide-react';
import type { SectionKey } from './nav';

/** The assistant is a pen and notebook, never a sparkle (DESIGN-BRIEF §5.5). */
export const sectionIcons = {
  home: House,
  properties: Building2,
  collections: Wallet,
  documents: FileText,
  assistant: NotebookPen,
  reports: ChartColumn,
  settings: SlidersHorizontal,
} as const satisfies Record<SectionKey, LucideIcon>;
