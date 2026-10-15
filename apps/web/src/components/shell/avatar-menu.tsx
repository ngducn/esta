'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { signOut } from '@/app/home-actions';
import { switchLanguage } from '@/app/language-actions';
import type { Locale } from '@/i18n/locale';

const menuId = 'account-menu';

const itemClass =
  'flex min-h-touch w-full items-center rounded-sm px-3 text-left text-body text-ink transition-colors duration-(--duration-fast) ease-standard hover:bg-rule/50';

export type AccountMenuProps = {
  name: string;
  household: string;
  role: string;
  links: readonly { key: string; href: string; label: string }[];
  switchLanguage: { locale: Locale; label: string };
  signOut: string;
};

/** A native popover, so the menu opens, closes on Escape or an outside tap, and keeps focus order with no script of its own. */
export function AvatarMenu({ name, household, role, links, switchLanguage: language, signOut: signOutLabel }: AccountMenuProps) {
  const pathname = usePathname();
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (menu.current?.matches(':popover-open')) menu.current.hidePopover();
  }, [pathname]);

  return (
    <div
      ref={menu}
      id={menuId}
      popover="auto"
      className="inset-auto inset-x-0 bottom-0 m-0 w-auto max-w-none translate-y-8 flex-col gap-2 rounded-t-md border-t border-rule bg-surface p-4 pb-[max(--spacing(4),env(safe-area-inset-bottom))] text-ink opacity-0 shadow-sheet transition-[translate,opacity,display,overlay] transition-discrete duration-(--duration-slow) ease-standard open:flex open:translate-y-0 open:opacity-100 starting:open:translate-y-8 starting:open:opacity-0 backdrop:bg-ink/20 lg:right-auto lg:bottom-3 lg:left-sidebar lg:w-sidebar lg:translate-y-0 lg:rounded-md lg:border lg:backdrop:bg-transparent"
    >
      <div className="flex flex-col gap-1 border-b border-rule px-3 pb-3">
        <p className="text-lead font-semibold break-words">{name}</p>
        <p className="text-small text-ink-muted break-words">{household}</p>
        <p className="text-small text-ink-muted">{role}</p>
      </div>
      <ul className="flex flex-col">
        {links.map((link) => (
          <li key={link.key}>
            <Link href={link.href} className={itemClass}>
              {link.label}
            </Link>
          </li>
        ))}
        <li>
          <form action={switchLanguage}>
            <input type="hidden" name="locale" value={language.locale} />
            <button type="submit" lang={language.locale} className={itemClass}>
              {language.label}
            </button>
          </form>
        </li>
      </ul>
      <form action={signOut} className="border-t border-rule pt-2">
        <button type="submit" className={itemClass}>
          {signOutLabel}
        </button>
      </form>
    </div>
  );
}

export function AccountTrigger({ initial, label, accessibleName }: { initial: string | null; label: string; accessibleName: string }) {
  return (
    <button
      type="button"
      popoverTarget={menuId}
      aria-label={accessibleName}
      className="flex min-h-touch max-w-full min-w-touch items-center gap-2 rounded-sm px-2 text-left text-small font-medium text-ink transition-colors duration-(--duration-fast) ease-standard hover:bg-rule/50"
    >
      {initial !== null && (
        <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-small font-semibold text-paper">
          {initial}
        </span>
      )}
      <span className="min-w-0 break-words">{label}</span>
    </button>
  );
}
