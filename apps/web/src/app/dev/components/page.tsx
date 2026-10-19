import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { UndoToastProvider } from '@/components/undo-toast-provider';
import { cn } from '@/lib/utils';
import { registry, registrySize } from './registry';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('devComponents');
  return { title: t('title') };
}

const anchor = (component: string) => component.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

export default async function DevComponentsPage() {
  const [t, messages] = await Promise.all([getTranslations('devComponents'), getMessages()]);
  return (
    <NextIntlClientProvider messages={{ components: messages.components, devComponents: messages.devComponents }}>
      <UndoToastProvider>
        <main data-registry-size={registrySize} className="mx-auto flex max-w-300 flex-col gap-12 px-4 py-8 sm:px-8">
          <header className="flex flex-col gap-3">
            <h1 className="text-h1 text-ink">{t('title')}</h1>
            <p className="max-w-prose text-lead text-ink-muted">{t('intro')}</p>
            <nav aria-label={t('title')}>
              <ul className="flex flex-wrap gap-x-1">
                {registry.map(({ component }) => (
                  <li key={component}>
                    <a href={`#${anchor(component)}`} className="inline-flex min-h-touch min-w-touch items-center justify-center px-2 text-body text-ink underline decoration-rule underline-offset-4 hover:decoration-ink">
                      {t(`names.${component}`)}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </header>
          {registry.map(({ component, wide = false, states }) => (
            <section key={component} id={anchor(component)} aria-labelledby={`${anchor(component)}-title`} className="flex scroll-mt-4 flex-col gap-6">
              <h2 id={`${anchor(component)}-title`} className="border-b border-ink pb-2 text-h2 text-ink">
                {t(`names.${component}`)}
              </h2>
              <div className={cn('grid gap-x-10 gap-y-8', !wide && 'md:grid-cols-2 xl:grid-cols-3')}>
                {states.map(({ state, render }) => (
                  <figure key={state} data-state-card data-component={component} data-state={state} className="flex min-w-0 flex-col gap-3 border-t border-rule pt-3">
                    <figcaption className="text-small text-ink-muted">{t(`states.${state}`)}</figcaption>
                    {render(t)}
                  </figure>
                ))}
              </div>
            </section>
          ))}
        </main>
      </UndoToastProvider>
    </NextIntlClientProvider>
  );
}
