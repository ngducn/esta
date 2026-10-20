import { describe, expect, it } from 'vitest';
import { bankAccountName, bankAccountNo } from './account';

describe('bankAccountName', () => {
  it('folds Vietnamese to the uppercase ASCII a bank prints', () => {
    expect(bankAccountName('  Nguyễn Thị   Demo ')).toBe('NGUYEN THI DEMO');
    expect(bankAccountName('Đặng Văn Đức Demo')).toBe('DANG VAN DUC DEMO');
  });

  it('refuses an empty, overlong or unprintable name', () => {
    expect(bankAccountName('   ')).toBeNull();
    expect(bankAccountName('A'.repeat(51))).toBeNull();
    expect(bankAccountName('DEMO 🙂')).toBeNull();
  });
});

describe('bankAccountNo', () => {
  it('drops the separators Mẹ copies with the number', () => {
    expect(bankAccountNo('0123 456.789')).toBe('0123456789');
    expect(bankAccountNo('vcb-001')).toBe('VCB001');
  });

  it('refuses an empty, overlong or foreign number', () => {
    expect(bankAccountNo('')).toBeNull();
    expect(bankAccountNo('1'.repeat(20))).toBeNull();
    expect(bankAccountNo('0123/456')).toBeNull();
  });
});
