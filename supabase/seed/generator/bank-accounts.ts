import { ESTA_INVOICE } from '../../../packages/core/src/vietqr/vectors.ts';
import { publicTable } from './context.ts';
import { householdId, personKey } from './households.ts';
import { seedId } from './ids.ts';

/** LSE-5: every household's default receiving account is the synthetic account of core's `ESTA_INVOICE` vector, held by Mẹ. */
export const bankAccounts = publicTable('bank_accounts', ({ household }) => [
  {
    id: seedId(`seed:bank-account:${household.key}`),
    household_id: householdId(household),
    bank_bin: ESTA_INVOICE.input.account.bin,
    account_no: ESTA_INVOICE.input.account.accountNo,
    account_name: ESTA_INVOICE.input.account.accountName,
    owner_party_id: seedId(`seed:party:${personKey('me', household)}`),
    is_default: true,
  },
]);
