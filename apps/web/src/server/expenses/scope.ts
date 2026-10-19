import 'server-only';
import { getLocale, getMessages } from 'next-intl/server';
import type { ExpenseScope } from '@/components/expenses/expense-host';
import { getClock } from '@/server/clock';
import type { Member } from '@/server/member';
import { loadExpenseVendors } from './load';

/** The vendors, the Clock's date and only the messages the expense sheet reads, for one property's sheet. */
export async function expenseScope(member: Member, property: { readonly id: string; readonly nickname: string }): Promise<ExpenseScope> {
  const [clock, vendors, locale, messages] = await Promise.all([getClock(), loadExpenseVendors(member.household.id), getLocale(), getMessages()]);
  const { money, date, toast } = messages.components;
  return {
    propertyId: property.id,
    nickname: property.nickname,
    today: clock.today(),
    vendors,
    locale,
    messages: { expenses: messages.expenses, components: { money, date, toast } },
  };
}
