import type { ReactNode } from 'react';

export function PageHeader({ title, meta, actions }: { title: string; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <div className="min-w-0 flex-[1_1_16rem]">
        <h1 className="text-title-2 text-balance lg:text-title-1">{title}</h1>
        {meta === undefined ? null : <div className="mt-1 flex flex-col gap-1 text-body-sm text-text-secondary">{meta}</div>}
      </div>
      {actions === undefined ? null : <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
