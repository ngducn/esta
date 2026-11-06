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
    'const a = comparable(street) === comparable(ward);'
  ],
  invalid: [
    { code: 'const a = legalAddress === currentAddress;', errors: found },
    { code: 'const a = row.certificate_address_text !== property.current_address;', errors: found },
    { code: "const a = normalize(legalAddress) == normalize(other.address);", errors: found },
    { code: 'const a = comparable(certificate) === comparable(address);', errors: found },
    { code: 'const a = a.address.line === b.address.line;', errors: found },
  ],
});
