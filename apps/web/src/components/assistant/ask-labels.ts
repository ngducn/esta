import type { getTranslations } from 'next-intl/server';
import type { AskFormLabels } from './ask-form';

type AskTranslator = Awaited<ReturnType<typeof getTranslations<'assistant.ask'>>>;

export function askFormLabels(t: AskTranslator, follow: boolean): AskFormLabels {
  return {
    question: follow ? t('followUpLabel') : t('questionLabel'),
    placeholder: follow ? t('followUpPlaceholder') : t('placeholder'),
    send: t('send'),
    sending: t('sending'),
    empty: t('emptyQuestion'),
    long: t('longQuestion'),
    failed: t('sendFailed'),
    busy: t('busy'),
  };
}

export const thinkHarderFor = (isOperator: boolean, t: AskTranslator) => (isOperator ? { label: t('thinkHarder'), hint: t('thinkHarderHint') } : null);
