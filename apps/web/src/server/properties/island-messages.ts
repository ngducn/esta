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

export async function valuationIslandIntl() {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  const { money, date } = messages.components;
  return { locale, messages: { valuations: messages.valuations, components: { money, date } } };
}

export async function meterIslandIntl() {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return { locale, messages: { meters: messages.meters } };
}

export async function statementIslandIntl() {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return { locale, messages: { statements: messages.statements } };
}

/** The record payment sheet's namespaces, for Home, which opens it without an intl provider of its own. */
export async function paymentIslandIntl() {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  const { money, date } = messages.components;
  return { locale, messages: { payments: messages.payments, components: { money, date } } };
}

/** The map's namespace, for a map island on a screen without an intl provider. */
export async function mapIslandIntl() {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return { locale, messages: { map: messages.map } };
}

export async function historyIslandIntl() {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return { locale, messages: { history: messages.history, components: { confirm: messages.components.confirm } } };
}

/** The tax card's other revenue form: its own labels and the money field's. */
export async function taxIslandIntl() {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return { locale, messages: { taxCard: messages.taxCard, components: { money: messages.components.money } } };
}
