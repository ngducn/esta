'use client';

import { LogOut } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { signOut } from '@/app/home-actions';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { AccountSettings, type SettingGroup } from './account-settings';
import { IntentLink } from './intent-link';
import type { SectionKey } from './nav';
import { sectionIcons } from './section-icons';

const menuId = 'account-menu';

const itemClass =
  'flex min-h-touch w-full items-center gap-3 rounded-md px-3 py-1 text-left text-label text-text transition-colors duration-(--duration-fast) ease-standard hover:bg-fill-hover-raised active:bg-fill-pressed-raised focus-visible:-outline-offset-2 [&_svg]:size-icon-md [&_svg]:shrink-0 [&_svg]:text-text-secondary';

const separator = <hr aria-hidden="true" className="-mx-1.5 my-1.5 border-t border-border" />;

const stops = 'a[href], button:not([popovertarget]), input[type="radio"]:checked';

export type AccountMenuProps = {
  name: string;
  initial: string | null;
  household: string;
  role: string;
  links: readonly { key: SectionKey; href: string; label: string }[];
  settings: readonly SettingGroup[];
  labels: { close: string; saveFailed: string; signOut: string };
};

function close(menu: HTMLDivElement | null) {
  if (menu?.matches(':popover-open')) menu.hidePopover();
}

/** Left and right stay inside a setting, so only up and down move between stops. */
function walk(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const all = [...event.currentTarget.querySelectorAll<HTMLElement>(stops)];
  const active = document.activeElement;
  const at = all.findIndex((stop) => stop === active || (stop instanceof HTMLInputElement && active instanceof HTMLInputElement && stop.name === active.name));
  const next = all[(at + (event.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length];
  event.preventDefault();
  next?.focus();
}

/**
 * A native popover: a bottom sheet under 840 px and a menu beside the member block from there, closing on Escape or an outside tap
 * and returning focus to its trigger. Taking a link does not dismiss a popover, so that closes it here.
 */
export function AvatarMenu({ name, initial, household, role, links, settings, labels }: AccountMenuProps) {
  const pathname = usePathname();
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => close(menu.current), [pathname]);

  return (
    <div
      ref={menu}
      id={menuId}
      popover="auto"
      onKeyDown={walk}
      onToggle={(event) => {
        if (event.newState === 'open') event.currentTarget.querySelector<HTMLElement>(stops)?.focus();
      }}
      className="inset-auto inset-x-0 bottom-0 m-0 max-h-[92dvh] w-auto max-w-none translate-y-8 flex-col overflow-y-auto overscroll-contain rounded-t-xl border-t border-border bg-surface-raised p-1.5 pb-[max(--spacing(1.5),env(safe-area-inset-bottom))] text-text opacity-0 shadow-lg transition-[translate,opacity,display,overlay] transition-discrete duration-(--duration-slow) ease-enter open:flex open:translate-y-0 open:opacity-100 starting:open:translate-y-8 starting:open:opacity-0 backdrop:bg-bg/85 md:right-auto md:bottom-3 md:left-rail md:ml-2 md:w-menu-wide md:translate-y-0 md:rounded-lg md:border md:shadow-md md:backdrop:bg-transparent lg:left-sidebar"
    >
      <span aria-hidden="true" className="mx-auto mt-1 mb-1 h-1 w-10 rounded-full bg-border-strong md:hidden" />
      <div className="flex items-center gap-3 p-3">
        <Avatar initial={initial} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="text-headline font-semibold break-words">{name}</p>
          <p className="text-body-sm break-words text-text-secondary">{`${role} · ${household}`}</p>
        </div>
        <button type="button" popoverTarget={menuId} popoverTargetAction="hide" className="min-h-touch rounded-md px-3 text-label text-accent-text hover:bg-fill-hover-raised md:hidden">
          {labels.close}
        </button>
      </div>
      {separator}
      <AccountSettings groups={settings} failed={labels.saveFailed} />
      {separator}
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
      </ul>
      {separator}
      <form action={signOut}>
        <button type="submit" className={itemClass}>
          <LogOut strokeWidth={1.8} aria-hidden="true" />
          {labels.signOut}
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
  compact?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      popoverTarget={menuId}
      aria-label={accessibleName}
      className={cn(
        'flex min-h-touch min-w-touch items-center gap-3 rounded-md p-2 text-left text-text transition-colors duration-(--duration-fast) ease-standard hover:bg-fill-hover focus-visible:-outline-offset-2',
        compact ? 'justify-center p-1' : 'max-lg:justify-center max-lg:p-1',
        className,
      )}
    >
      <Avatar initial={initial} />
      {compact ? null : (
        <span className="flex min-w-0 flex-1 flex-col max-lg:hidden">
          <span className="truncate text-label">{label}</span>
          {detail && <span className="text-body-sm text-text-secondary">{detail}</span>}
        </span>
      )}
    </button>
  );
}
