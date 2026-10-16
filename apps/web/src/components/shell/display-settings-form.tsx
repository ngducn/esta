import { Check, Languages, Moon, Rows3, Type, type LucideIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { saveDisplaySettings } from '@/app/(app)/settings/actions';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { densityNames, textScales, type Density, type TextScale } from '@/design/tokens';
import { locales, type Locale } from '@/i18n/locale';
import { themePreferences, type ThemePreference } from '@/server/theme';

export type DisplaySettings = { locale: Locale; textScale: TextScale; density: Density; theme: ThemePreference };

export type SaveStatus = 'saved' | 'failed' | null;

const optionClass =
  'flex min-h-touch cursor-pointer items-start gap-3 rounded-md border border-rule bg-surface px-3 py-2.5 transition-colors duration-(--duration-fast) ease-standard hover:border-field has-checked:border-ink has-checked:bg-surface-2';

function Choice({
  legend,
  icon: Icon,
  hint,
  children,
  wide,
}: {
  legend: string;
  icon: LucideIcon;
  hint?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Card>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 flex items-center gap-3 text-lead font-bold">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-2">
            <Icon className="size-5" strokeWidth={1.8} aria-hidden="true" />
          </span>
          {legend}
        </legend>
        {hint && <p className="text-small text-ink-muted">{hint}</p>}
        <div className={wide ? 'grid gap-2 sm:grid-cols-2' : 'grid gap-2 sm:grid-cols-3'}>{children}</div>
      </fieldset>
    </Card>
  );
}

function Option({ name, value, checked, label, hint }: { name: string; value: string; checked: boolean; label: string; hint?: string }) {
  return (
    <label className={optionClass}>
      <input type="radio" name={name} value={value} defaultChecked={checked} className="mt-0.5 size-5 shrink-0 accent-accent" />
      <span className="flex min-w-0 flex-col">
        <span className="font-medium break-words">{label}</span>
        {hint && <span className="text-small text-ink-muted break-words">{hint}</span>}
      </span>
    </label>
  );
}

export async function DisplaySettingsForm({ settings, status }: { settings: DisplaySettings; status: SaveStatus }) {
  const t = await getTranslations('settings');
  return (
    <form action={saveDisplaySettings} aria-labelledby="display-heading" className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="display-heading" className="text-h3">
          {t('display')}
        </h2>
        <p className="text-ink-muted">{t('displayIntro')}</p>
        {status === 'saved' && (
          <p role="status" className="flex items-center gap-2 font-semibold text-paid">
            <Check className="size-5" strokeWidth={2.2} aria-hidden="true" />
            {t('saved')}
          </p>
        )}
        {status === 'failed' && (
          <p role="alert" className="font-semibold text-overdue">
            {t('saveFailed')}
          </p>
        )}
      </div>
      <Choice legend={t('language')} icon={Languages} wide>
        {locales.map((locale) => (
          <Option key={locale} name="locale" value={locale} checked={settings.locale === locale} label={t(`languages.${locale}`)} />
        ))}
      </Choice>
      <Choice legend={t('textScale')} icon={Type}>
        {textScales.map((scale) => (
          <Option
            key={scale}
            name="textScale"
            value={String(scale)}
            checked={settings.textScale === scale}
            label={t('textScaleOption', { scale })}
            hint={t(`textScaleHints.s${scale}`)}
          />
        ))}
      </Choice>
      <Choice legend={t('density')} icon={Rows3} wide>
        {densityNames.map((density) => (
          <Option
            key={density}
            name="density"
            value={density}
            checked={settings.density === density}
            label={t(`densities.${density}`)}
            hint={t(`densityHints.${density}`)}
          />
        ))}
      </Choice>
      <Choice legend={t('theme')} icon={Moon} hint={t('themeHint')} wide>
        {themePreferences.map((theme) => (
          <Option key={theme} name="theme" value={theme} checked={settings.theme === theme} label={t(`themes.${theme}`)} />
        ))}
      </Choice>
      <button type="submit" className={buttonVariants({ className: 'mt-2 self-start' })}>
        {t('save')}
      </button>
    </form>
  );
}
