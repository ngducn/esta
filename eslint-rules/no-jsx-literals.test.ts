import { join } from 'node:path';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, it } from 'vitest';
import rule from './no-jsx-literals.mjs';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const repoRoot = join(import.meta.dirname, '..');
const page = join(repoRoot, 'apps/web/src/app/page.tsx');
const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
});

const text = [{ messageId: 'text' }];
const attribute = (name: string) => [{ messageId: 'attribute', data: { name } }];

ruleTester.run('esta/no-jsx-literals', rule, {
  valid: [
    { filename: page, code: 'const a = <p>{t("app.tagline")}</p>;' },
    { filename: page, code: 'const a = <button aria-label={t("close")} title={t("close")} />;' },
    { filename: page, code: 'const a = <p>\n  {t("a")}{" "}\n  {t("b")}\n</p>;' },
    { filename: page, code: 'const a = <p>{count} · {total}</p>;' },
    { filename: page, code: 'const a = <img alt="" src={src} />;' },
    { filename: page, code: 'const a = <div className="stack" data-testid="date-line" />;' },
    { filename: page, code: 'const a = <p>{cond ? t("yes") : null}</p>;' },
    { filename: join(repoRoot, 'apps/web/src/app/dev/page.tsx'), code: 'const a = <h1 title="Dev">Dev pages</h1>;' },
    { filename: join(repoRoot, 'apps/web/src/app/dev/core/page.tsx'), code: 'const a = <p>MISMATCH</p>;' },
  ],
  invalid: [
    { filename: page, code: 'const a = <p>Xin chào</p>;', errors: text },
    { filename: page, code: 'const a = <><h1>Esta</h1></>;', errors: text },
    { filename: page, code: "const a = <p>{'Xin chào'}</p>;", errors: text },
    { filename: page, code: 'const a = <p>{`${n} phòng`}</p>;', errors: text },
    { filename: page, code: "const a = <p>{late ? 'Quá hạn' : t('ok')}</p>;", errors: text },
    { filename: page, code: "const a = <p>{late && 'Quá hạn'}</p>;", errors: text },
    { filename: page, code: 'const a = <button aria-label="Đóng" />;', errors: attribute('aria-label') },
    { filename: page, code: 'const a = <span title="Sổ hồng" />;', errors: attribute('title') },
    { filename: page, code: "const a = <input placeholder={'Tìm tài sản'} />;", errors: attribute('placeholder') },
    { filename: page, code: 'const a = <img alt="Ảnh sổ" src={src} />;', errors: attribute('alt') },
    { filename: join(repoRoot, 'apps/web/src/app/developer/page.tsx'), code: 'const a = <p>Xin chào</p>;', errors: text },
  ],
});
