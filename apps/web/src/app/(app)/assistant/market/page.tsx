import { researchTouches } from '@esta/core/research';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AssistantHeader, assistantStatus } from '@/components/assistant/assistant-header';
import { MarketItem } from '@/components/assistant/market-item';
import { isLocale } from '@/i18n/locale';
import { cn } from '@/lib/utils';
import { loadMarket, type MarketProperty } from '@/server/agent/research';
import { getClock } from '@/server/clock';
import { env } from '@/server/env';
import { requireMember } from '@/server/member';

export async function generateMetadata() {
  const t = await getTranslations('assistant.market');
  return { title: t('title') };
}

const chip = 'inline-flex min-h-touch items-center gap-2 rounded-full border px-4 text-small font-medium transition-colors duration-(--duration-fast) ease-standard';
const card = 'rounded-lg border border-rule bg-surface p-5 text-body text-pretty text-ink-2 shadow-card sm:p-6';

export default async function MarketPage({ searchParams }: { searchParams: Promise<{ property?: string }> }) {
  const clock = await getClock();
  const member = await requireMember();
  const [{ property }, status, market, t, locale] = await Promise.all([searchParams, assistantStatus(clock.now()), loadMarket(member.household.id, clock.now(), env.ESTA_TIMEZONE), getTranslations('assistant.market'), getLocale()]);
  const selected = market.properties.find((candidate) => candidate.id === property) ?? null;
  const touching = (held: MarketProperty) => market.items.filter((item) => researchTouches(item, held));
  const shown = selected === null ? market.items : touching(selected);
  const choices = [
    { href: '/assistant/market', label: t('all'), count: market.items.length, current: selected === null },
    ...market.properties.map((held) => ({ href: `/assistant/market?property=${held.id}`, label: held.nickname, count: touching(held).length, current: held.id === selected?.id })).filter((choice) => choice.count > 0 || choice.current),
  ];
  return (
    <div className="flex flex-col gap-6">
      <AssistantHeader householdId={member.household.id} now={clock.now()} status={status} active="market" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <section aria-labelledby="market-heading" data-testid="market" className="flex max-w-3xl min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="market-heading" className="text-h3 font-semibold text-ink">
              {t('heading')}
            </h2>
            <p data-testid="market-count" className="text-small text-ink-muted">
              {t('count', { count: shown.length })}
            </p>
          </div>
          {market.items.length === 0 ? null : (
            <nav aria-label={t('filter')}>
              <ul className="flex flex-wrap gap-2">
                {choices.map((choice) => (
                  <li key={choice.href}>
                    <Link
                      href={choice.href}
                      replace
                      scroll={false}
                      aria-current={choice.current ? 'true' : undefined}
                      data-filter="property"
                      className={cn(chip, choice.current ? 'border-ink bg-ink text-surface' : 'border-rule-strong bg-surface text-ink hover:border-field')}
                    >
                      <span className="break-words">{choice.label}</span>
                      <span className={cn('font-medium tabular-nums', !choice.current && 'text-ink-muted')}>{choice.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          {market.emptyToday === null ? null : (
            <p data-testid="market-empty-today" className={card}>
              {market.emptyToday}
            </p>
          )}
          {shown.length === 0 ? (
            <p data-testid="market-empty" className={card}>
              {selected === null ? t('empty') : t('emptyFor', { property: selected.nickname })}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {shown.map((item) => (
                <li key={item.id}>
                  <MarketItem item={item} locale={isLocale(locale) ? locale : 'vi'} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <aside aria-labelledby="topics-heading" data-testid="topics" className="flex flex-col gap-3 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
          <h2 id="topics-heading" className="text-lead font-semibold text-ink">
            {t('topics')}
          </h2>
          <p className="text-body text-pretty text-ink-2">{t('topicsIntro')}</p>
          {market.topics.length === 0 ? (
            <p className="text-body text-ink-muted">{t('noTopics')}</p>
          ) : (
            <ul className="flex flex-col">
              {market.topics.map((topic) => (
                <li key={topic} data-testid="topic" className="border-t border-rule py-2 text-body break-words text-ink first:border-t-0 first:pt-0">
                  {topic}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
