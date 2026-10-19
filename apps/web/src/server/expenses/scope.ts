import 'server-only';
import type { ExpenseScope } from '@/components/expenses/expense-host';
import { getClock } from '@/server/clock';
import type { Member } from '@/server/member';
import { expenseIslandIntl } from '@/server/properties/island-messages';
import { loadExpenseVendors } from './load';

export async function expenseScope(member: Member, property: { readonly id: string; readonly nickname: string }): Promise<ExpenseScope> {
  const [clock, vendors, intl] = await Promise.all([getClock(), loadExpenseVendors(member.household.id), expenseIslandIntl()]);
  return { propertyId: property.id, nickname: property.nickname, today: clock.today(), vendors, ...intl };
}
