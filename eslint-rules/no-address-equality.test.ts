import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, it } from 'vitest';
import rule from './no-address-equality.mjs';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({ languageOptions: { parser: tseslint.parser, sourceType: 'module' } });
const found = [{ messageId: 'sameAddress' }];

ruleTester.run('esta/no-address-equality', rule, {
  valid: [
    'const a = address === null;',
    "const a = address === '';",
    'const a = address !== undefined;',
    'const a = sameAddress(legal, current);',
    'const a = row.addressProvince === property.provinceCode;',
    'const a = street === ward;',
    'const a = street.localeCompare(ward, "vi") === 0;',
    'const a = rows.toSorted((x, y) => x.addressLine.localeCompare(y.addressLine, "vi"));',
    'const a = sameName(before, after) && count === total;',
    'const a = format(street) === format(ward);'
  ],
  invalid: [
    { code: 'const a = legalAddress === currentAddress;', errors: found },
    { code: 'const a = row.certificate_address_text !== property.current_address;', errors: found },
    { code: "const a = normalize(legalAddress) == normalize(other.address);", errors: found },
    { code: 'const a = comparable(certificate) === comparable(address);', errors: found },
    { code: 'const a = a.address.line === b.address.line;', errors: found },
    { code: 'const a = legal !== null && current !== null && comparable(legal) === comparable(current);', errors: found },
    { code: 'const a = after === null || before === null || normalizeName(before) === normalizeName(after.value);', errors: found },
    { code: "const a = legalAddress.localeCompare(currentAddress, 'vi', { sensitivity: 'base' }) === 0;", errors: found },
    { code: "const a = legalAddress.localeCompare(currentAddress, 'vi') !== 0;", errors: found },
    { code: "const a = normalize(lhs) !== normalize(rhs);", errors: found },
  ],
});
