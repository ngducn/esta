import 'server-only';
import { getLocale, getMessages } from 'next-intl/server';

/** Only the namespaces the property form islands read, so no route ships the whole message file. */
export async function propertyIslandIntl() {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  const { money, date, confirm, toast } = messages.components;
  return {
    locale,
    messages: { propertyForm: messages.propertyForm, properties: messages.properties, components: { money, date, confirm, toast } },
  };
}

export async function expenseIslandIntl() {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  const { money, date } = messages.components;
  return { locale, messages: { expenses: messages.expenses, components: { money, date } } };
}

export async function meterIslandIntl() {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return { locale, messages: { meters: messages.meters } };
}
