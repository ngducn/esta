import type { LucideIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { EMPTY_STATES, emptyState, looseTranslate, type EmptyContext, type EmptySurface, type EmptyValues } from '@/app/empty-states';
import { EmptyState } from '@/components/empty-state';

export async function RegistryEmptyState({
  surface,
  ctx,
  values,
  icon,
  tone,
  className,
  cta,
}: {
  surface: EmptySurface;
  ctx: EmptyContext;
  values?: EmptyValues;
  icon?: LucideIcon;
  tone?: 'good';
  className?: string;
  cta?: (label: string) => ReactNode;
}) {
  const t = await (getTranslations as (namespace: string) => Promise<unknown>)(EMPTY_STATES[surface].ns);
  const { title, body, action } = emptyState(surface, looseTranslate(t), ctx, values);
  return (
    <EmptyState
      title={title}
      surface={surface}
      {...(body === undefined ? {} : { body })}
      {...(icon === undefined ? {} : { icon })}
      {...(tone === undefined ? {} : { tone })}
      {...(className === undefined ? {} : { className })}
      {...(action === undefined ? {} : action.href === null ? { cta: cta?.(action.label) } : { action: { label: action.label, href: action.href } })}
    />
  );
}
