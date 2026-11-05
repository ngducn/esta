import type { ReactNode } from 'react';

export function SettingsSection({ id, title, intro, children }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} data-testid={`settings-${id}`} className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-heading`} className="text-title-3">
          {title}
        </h2>
        {intro === undefined ? null : <p className="text-text-muted">{intro}</p>}
      </div>
      {children}
    </section>
  );
}
