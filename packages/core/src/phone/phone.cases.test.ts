import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { firstMobile, firstPhone, formatPhone, isMobile, normalizePhone } from './index';
import { PHONE_CASES } from './phone.cases';

describe('the phone parser on its case table', () => {
  it.each(PHONE_CASES)('$name: $text', ({ text, phone, mobile }) => {
    const read = normalizePhone(text);
    if (phone === null) {
      expect(read.ok).toBe(false);
      return;
    }
    expect(read).toEqual({ ok: true, value: phone });
    if (read.ok) expect(isMobile(read.value)).toBe(mobile);
  });

  it('opens Zalo only on a mobile, whichever number comes first', () => {
    expect(firstMobile(['+84 251 382 4567', null])).toBeNull();
    expect(firstMobile(['028 3823 4567', '0903 123 456'])).toBe('+84903123456');
    expect(firstPhone(['028 3823 4567', '0903 123 456'])).toBe('+842838234567');
  });
});

describe('the phone parser on generated numbers', () => {
  const mobile = fc.tuple(fc.constantFrom(3, 5, 7, 8, 9), fc.stringMatching(/^[0-9]{8}$/)).map(([lead, rest]) => `${lead}${rest}`);
  const prefix = fc.constantFrom('0', '+84', '84', '0084', '+84 0');
  const separator = fc.constantFrom('', ' ', '.', '-');

  it('reads every spelling of a number as one E.164 phone, and reads its own display back', () => {
    fc.assert(
      fc.property(mobile, prefix, separator, (subscriber, lead, sep) => {
        const text = `${lead}${sep}${subscriber.slice(0, 3)}${sep}${subscriber.slice(3, 6)}${sep}${subscriber.slice(6)}`;
        const read = normalizePhone(text);
        expect(read).toEqual({ ok: true, value: `+84${subscriber}` });
        if (read.ok) expect(normalizePhone(formatPhone(read.value))).toEqual(read);
      }),
      { seed: 20261007, numRuns: 500 },
    );
  });
});
