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
