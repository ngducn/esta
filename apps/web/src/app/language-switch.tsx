import { getLocale, getTranslations } from 'next-intl/server';
import { switchLanguage } from './language-actions';

export async function LanguageSwitch() {
  const [t, locale] = await Promise.all([getTranslations('language'), getLocale()]);
  const next = locale === 'vi' ? 'en' : 'vi';
  return (
    <form action={switchLanguage}>
      <input type="hidden" name="locale" value={next} />
      <button type="submit" lang={next} className="min-h-11 px-2 underline underline-offset-4">
        {t('switchTo')}
      </button>
    </form>
  );
}
