import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';
import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import rule from './no-guard-disable.mjs';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({ plugins: { '@eslint-community/eslint-comments': eslintComments } });
const guard = [{ messageId: 'guard' }];

ruleTester.run('esta/no-guard-disable', rule, {
  valid: [
    '// eslint-disable-next-line no-console -- the log is intended\nconst a = 1;',
    '/* eslint-disable no-console */\nconst a = 1;',
    '// eslint-disable-next-line no-console -- see @eslint-community/eslint-comments/no-restricted-disable\nconst a = 1;',
    '/* eslint-enable @eslint-community/eslint-comments/no-restricted-disable */\nconst a = 1;',
    '// mentions eslint-disable and eslint-comments/ in prose\nconst a = 1;',
  ],
  invalid: [
    { code: '/* eslint-disable @eslint-community/eslint-comments/no-restricted-disable */\nconst a = 1;', errors: guard },
    { code: '/* eslint-disable @eslint-community/eslint-comments/no-restricted-disable -- reason */\nconst a = 1;', errors: guard },
    { code: '// eslint-disable-next-line @eslint-community/eslint-comments/require-description\nconst a = 1;', errors: guard },
    {
      code: 'const a = 1; // eslint-disable-line no-console, @eslint-community/eslint-comments/no-unlimited-disable',
      errors: guard,
    },
    {
      code: '/* eslint-disable\n\n  @eslint-community/eslint-comments/no-restricted-disable -- reason */\nconst a = 1;',
      errors: guard,
    },
    {
      code: '/* eslint-disable no-console,\n  @eslint-community/eslint-comments/no-restricted-disable */\nconst a = 1;',
      errors: guard,
    },
    {
      code: '/* eslint-disable @eslint-community/eslint-comments/no-restricted-disable */\n/* eslint-disable @eslint-community/eslint-comments/require-description */\nconst a = 1;',
      errors: [
        { messageId: 'guard', line: 1 },
        { messageId: 'guard', line: 2 },
      ],
    },
  ],
});
