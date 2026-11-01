'use client';

import { Languages, LogOut } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { signOut } from '@/app/home-actions';
import { switchLanguage } from '@/app/language-actions';
import type { Locale } from '@/i18n/locale';
import { IntentLink } from './intent-link';
import type { SectionKey } from './nav';
import { sectionIcons } from './section-icons';

const menuId = 'account-menu';

const itemClass =
  'flex min-h-touch w-full items-center gap-3 rounded-md px-3 text-left text-body text-text transition-colors duration-(--duration-fast) ease-standard hover:bg-fill-hover [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-text-muted';

export type AccountMenuProps = {
  name: string;
  household: string;
  role: string;
  links: readonly { key: SectionKey; href: string; label: string }[];
  switchLanguage: { locale: Locale; label: string };
  signOut: string;
};

function close(menu: HTMLDivElement | null) {
  if (menu?.matches(':popover-open')) menu.hidePopover();
}

/**
 * A native popover, so the menu opens, closes on Escape or an outside tap, and keeps focus order with no script of its own.
 * Taking a link or switching language does not dismiss a popover, so those close it here.
 */
export function AvatarMenu({ name, household, role, links, switchLanguage: language, signOut: signOutLabel }: AccountMenuProps) {
  const pathname = usePathname();
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => close(menu.current), [pathname]);

  return (
    <div
      ref={menu}
      id={menuId}
      popover="auto"
      className="inset-auto inset-x-0 bottom-0 m-0 w-auto max-w-none translate-y-8 flex-col gap-2 rounded-t-lg border-t border-border bg-surface p-4 pb-[max(--spacing(4),env(safe-area-inset-bottom))] text-text opacity-0 shadow-lg transition-[translate,opacity,display,overlay] transition-discrete duration-(--duration-slow) ease-standard open:flex open:translate-y-0 open:opacity-100 starting:open:translate-y-8 starting:open:opacity-0 backdrop:bg-bg/85 lg:right-auto lg:bottom-3 lg:left-sidebar lg:w-sidebar lg:translate-y-0 lg:rounded-lg lg:border lg:backdrop:bg-transparent"
    >
      <div className="flex flex-col gap-1 border-b border-border px-3 pb-3">
        <p className="text-headline font-semibold break-words">{name}</p>
        <p className="text-body-sm text-text-muted break-words">{household}</p>
        <p className="text-body-sm text-text-muted">{role}</p>
      </div>
      <ul className="flex flex-col">
        {links.map((link) => {
          const Icon = sectionIcons[link.key];
          return (
            <li key={link.key}>
              <IntentLink href={link.href} className={itemClass}>
                <Icon strokeWidth={1.8} aria-hidden="true" />
                {link.label}
              </IntentLink>
            </li>
          );
        })}
        <li>
          <form action={switchLanguage} onSubmit={() => close(menu.current)}>
            <input type="hidden" name="locale" value={language.locale} />
            <button type="submit" lang={language.locale} className={itemClass}>
              <Languages strokeWidth={1.8} aria-hidden="true" />
              {language.label}
            </button>
          </form>
        </li>
      </ul>
      <form action={signOut} className="mt-4 border-t border-border pt-4">
        <button type="submit" className={itemClass}>
          <LogOut strokeWidth={1.8} aria-hidden="true" />
          {signOutLabel}
        </button>
      </form>
    </div>
  );
}

export function AccountTrigger({
  initial,
  label,
  detail,
  accessibleName,
  compact = false,
  className,
}: {
  initial: string | null;
  label: string;
  detail?: string;
  accessibleName: string;
  /** The phone header: a fixed one-word label that never wraps, so the date line wraps instead at 130%. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      popoverTarget={menuId}
      aria-label={accessibleName}
      className={`flex min-h-touch max-w-full min-w-touch items-center rounded-md py-1.5 text-left text-text transition-colors duration-(--duration-fast) ease-standard hover:bg-fill-hover ${compact ? 'shrink-0 gap-2 px-1' : 'gap-3 px-2'} ${className ?? ''}`}
    >
      {initial !== null && (
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-inverse text-body font-medium text-text-inverse">
          {initial}
        </span>
      )}
      <span className="flex min-w-0 flex-col">
        <span className={compact ? 'font-medium whitespace-nowrap' : 'font-medium break-words'}>{label}</span>
        {detail && <span className="text-body-sm text-text-muted break-words">{detail}</span>}
      </span>
    </button>
  );
}
