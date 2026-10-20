import { foldVietnamese } from '../search/fold';
import { ASCII_UPPERCASE, VIETQR_RULES } from './rules';

/** [app rule] The longest account name `bank_accounts` keeps, as the bank prints it. */
export const ACCOUNT_NAME_MAX_CHARS = 50;

const ACCOUNT_NO = new RegExp(`^[0-9A-Z]{1,${VIETQR_RULES.accountMaxChars}}$`);

/** The account name as banks print it: `Nguyễn Thị  Demo` reads `NGUYEN THI DEMO`. Null when nothing printable is left. */
export function bankAccountName(typed: string): string | null {
  const name = foldVietnamese(typed).toUpperCase().replace(/\s+/g, ' ').trim();
  return name !== '' && name.length <= ACCOUNT_NAME_MAX_CHARS && ASCII_UPPERCASE.test(name) ? name : null;
}

/** The account number without the spaces or dots Mẹ copies with it: `0123 456 789` reads `0123456789`. */
export function bankAccountNo(typed: string): string | null {
  const number = typed.replace(/[\s.-]/g, '').toUpperCase();
  return ACCOUNT_NO.test(number) ? number : null;
}
