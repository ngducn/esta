import { withheldKinds } from '@esta/core/export';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { env } from '@/server/env';
import type { Member } from '@/server/member';
import { DataExport } from './data-export';

export async function DataSection({ member }: { member: Member }) {
  if (member.role !== 'admin') return null;
  const t = await getTranslations('dataExport');
  const minutes = Math.max(1, Math.round(env.ESTA_SIGNED_URL_TTL_SECONDS / 60));
  const labels = {
    start: t('start'),
    preparing: t('preparing'),
    ready: t('ready', { minutes }),
    readyPart: t('readyPart', { part: '{part}', total: '{total}', minutes }),
    manyParts: t('manyParts', { total: '{total}' }),
    failed: t('failed'),
  };
  const kinds = withheldKinds(member.isOperator);
  const withheld = [kinds.has('operator') ? { key: 'operator', text: t('withheldOperator') } : null, kinds.has('chats') ? { key: 'chats', text: t('withheldChats') } : null].filter((line) => line !== null);
  return (
    <section aria-labelledby="data-heading" data-testid="settings-data" className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="data-heading" className="text-title-3">
          {t('title')}
        </h2>
        <p className="text-text-muted">{t('intro')}</p>
      </div>
      <Card className="flex flex-col gap-3">
        <div data-testid="export-withheld" className="flex flex-col gap-1 text-body-sm text-text-muted">
          <p>{t('withheldTitle')}</p>
          <ul className="list-disc pl-5">
            {withheld.map((line) => (
              <li key={line.key}>{line.text}</li>
            ))}
          </ul>
          <p>{t('withheldBackup')}</p>
        </div>
        <DataExport labels={labels} />
        <p className="text-body-sm text-text-muted">{t('sensitive')}</p>
      </Card>
    </section>
  );
}
