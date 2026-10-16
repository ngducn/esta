import { Languages } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { switchLanguage } from './language-actions';

export async function LanguageSwitch() {
  const [t, locale] = await Promise.all([getTranslations('language'), getLocale()]);
  const next = locale === 'vi' ? 'en' : 'vi';
  return (
    <form action={switchLanguage}>
      <input type="hidden" name="locale" value={next} />
      <button
        type="submit"
        lang={next}
        className="inline-flex min-h-touch items-center gap-2 rounded-sm border border-rule-strong bg-surface px-3 text-small font-semibold text-ink transition-colors duration-(--duration-fast) ease-standard hover:bg-surface-2"
      >
        <Languages className="size-4.5 text-ink-muted" strokeWidth={1.8} aria-hidden="true" />
        {t('switchTo')}
      </button>
    </form>
  );
}
