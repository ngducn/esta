import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { saveDisplaySettings } from '@/app/(app)/settings/actions';
import { buttonVariants } from '@/components/ui/button';
import { densityNames, textScales, type Density, type TextScale } from '@/design/tokens';
import { locales, type Locale } from '@/i18n/locale';
import { themePreferences, type ThemePreference } from '@/server/theme';

export type DisplaySettings = { locale: Locale; textScale: TextScale; density: Density; theme: ThemePreference };

export type SaveStatus = 'saved' | 'failed' | null;

const optionClass =
  'flex min-h-touch cursor-pointer items-start gap-3 rounded-sm border border-rule px-3 py-2.5 transition-colors duration-(--duration-fast) ease-standard hover:border-ink-muted has-checked:border-ink has-checked:bg-surface';

function Choice({ legend, hint, children, wide }: { legend: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-h3 font-semibold">{legend}</legend>
      {hint && <p className="-mt-2 text-small text-ink-muted">{hint}</p>}
      <div className={wide ? 'grid gap-2 sm:grid-cols-2' : 'grid grid-cols-3 gap-2'}>{children}</div>
    </fieldset>
  );
}

function Option({ name, value, checked, label, hint }: { name: string; value: string; checked: boolean; label: string; hint?: string }) {
  return (
    <label className={optionClass}>
      <input type="radio" name={name} value={value} defaultChecked={checked} className="mt-0.5 size-5 shrink-0 accent-ink" />
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
    <form action={saveDisplaySettings} aria-labelledby="display-heading" className="flex max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 id="display-heading" className="text-h3 lg:text-h2">
          {t('display')}
        </h2>
        <p className="text-ink-muted">{t('displayIntro')}</p>
      </div>
      <Choice legend={t('language')} wide>
        {locales.map((locale) => (
          <Option key={locale} name="locale" value={locale} checked={settings.locale === locale} label={t(`languages.${locale}`)} />
        ))}
      </Choice>
      <Choice legend={t('textScale')}>
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
      <Choice legend={t('density')} wide>
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
      <Choice legend={t('theme')} hint={t('themeHint')}>
        {themePreferences.map((theme) => (
          <Option key={theme} name="theme" value={theme} checked={settings.theme === theme} label={t(`themes.${theme}`)} />
        ))}
      </Choice>
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className={buttonVariants()}>
          {t('save')}
        </button>
        {status === 'saved' && <p role="status">{t('saved')}</p>}
        {status === 'failed' && (
          <p role="alert" className="text-overdue-ink">
            {t('saveFailed')}
          </p>
        )}
      </div>
    </form>
  );
}
