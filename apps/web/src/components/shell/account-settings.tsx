'use client';

import { Languages, Moon, Rows3, Type } from 'lucide-react';
import { useId, useState, type ChangeEvent } from 'react';
import { applyDisplaySettings } from '@/app/(app)/settings/actions';
import { useAction } from '@/components/use-action';

const icons = { textScale: Type, theme: Moon, density: Rows3, locale: Languages } as const;

export type SettingGroup = {
  name: keyof typeof icons;
  label: string;
  value: string;
  options: readonly { value: string; label: string; lang?: string }[];
};

export function AccountSettings({ groups, failed }: { groups: readonly SettingGroup[]; failed: string }) {
  const prefix = useId();
  const [saveFailed, setSaveFailed] = useState(false);
  const { run } = useAction();

  const apply = (event: ChangeEvent<HTMLFormElement>) => {
    const data = new FormData(event.currentTarget);
    run(() => applyDisplaySettings(data), (saved) => setSaveFailed(saved !== true));
  };

  return (
    <form onChange={apply} className="flex flex-col">
      {groups.map(({ name, label, value, options }) => {
        const Icon = icons[name];
        return (
          <div key={name} role="radiogroup" aria-labelledby={`${prefix}-${name}`} className="flex flex-col gap-2 px-3 py-2">
            <p id={`${prefix}-${name}`} className="flex items-center gap-3 text-label">
              <Icon className="size-icon-md text-text-secondary" strokeWidth={1.8} aria-hidden="true" />
              {label}
            </p>
            <div className="flex gap-0.5 rounded-md border border-border-strong bg-bg-subtle p-0.5">
              {options.map((option) => (
                <label key={option.value} className="relative flex min-w-0 flex-1">
                  <input type="radio" name={name} value={option.value} defaultChecked={option.value === value} className="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0" />
                  <span
                    {...(option.lang === undefined ? {} : { lang: option.lang })}
                    className="flex min-h-10 flex-1 items-center justify-center rounded-sm border border-transparent px-2 text-center text-label text-text-secondary transition-colors duration-(--duration-fast) ease-standard peer-[:not(:checked):hover]:bg-fill-hover-raised peer-[:not(:checked):hover]:text-text peer-checked:border-accent-border peer-checked:bg-accent-subtle peer-checked:font-semibold peer-checked:text-accent-text peer-focus-visible:outline-(length:--stroke-focus) peer-focus-visible:outline-focus-ring"
                  >
                    {option.label}
                  </span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
      {saveFailed && (
        <p role="alert" className="px-3 pb-2 text-body-sm font-medium text-danger-text">
          {failed}
        </p>
      )}
    </form>
  );
}
