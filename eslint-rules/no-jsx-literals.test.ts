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
const metadata = (name: string) => [{ messageId: 'metadata', data: { name } }];
const layout = join(repoRoot, 'apps/web/src/app/layout.tsx');

ruleTester.run('esta/no-jsx-literals', rule, {
  valid: [
    { filename: page, code: 'const a = <p>{t("app.tagline")}</p>;' },
    { filename: page, code: 'const a = <button aria-label={t("close")} title={t("close")} />;' },
    { filename: page, code: 'const a = <p>\n  {t("a")}{" "}\n  {t("b")}\n</p>;' },
    { filename: page, code: 'const a = <p>{count} · {total}</p>;' },
    { filename: page, code: 'const a = <img alt="" src={src} />;' },
    { filename: page, code: 'const a = <div className="stack" data-testid="date-line" />;' },
    { filename: page, code: 'const a = <p>{cond ? t("yes") : null}</p>;' },
    { filename: page, code: 'const a = <Btn variant="primary" size="sm" tone="danger-strong" />;' },
    { filename: page, code: 'const a = <div className="flex gap-2 text-ink" id="main nav" role="navigation" />;' },
    { filename: page, code: 'const a = <a href="/tài-sản?q=a b" rel="noopener noreferrer" target="_blank" />;' },
    { filename: page, code: 'const a = <img src="/ảnh sổ.png" alt={t("photo")} />;' },
    { filename: page, code: 'const a = <form method="post" name="lease form"><input type="text" name="full name" /></form>;' },
    { filename: page, code: 'const a = <li key="row 1" data-state="đang thuê" data-testid="lease row" />;' },
    { filename: page, code: 'const a = <div aria-labelledby="a b" aria-describedby="c d" aria-hidden="true" aria-live="polite" />;' },
    { filename: page, code: 'const a = <svg viewBox="0 0 24 24"><path d="M0 0 L10 10 Z" /></svg>;' },
    { filename: page, code: 'const a = <Btn label={t("delete")} title={cond ? t("a") : t("b")} />;' },
    { filename: page, code: 'const a = <p>{count + 1}</p>;' },
    { filename: page, code: 'const L = t("late");\nconst a = <p>{L}</p>;' },
    { filename: page, code: 'let L = "Quá hạn";\nL = t("late");\nconst a = <p>{L}</p>;' },
    { filename: page, code: 'export const metadata = { title: t("x") };' },
    { filename: join(repoRoot, 'apps/web/src/components/meta.tsx'), code: 'export const metadata = { title: "Esta" };' },
    { filename: layout, code: 'const metadata = { title: "Esta" };' },
    { filename: layout, code: 'export const config = { title: "Esta" };' },
    { filename: join(repoRoot, 'apps/web/src/app/dev/page.tsx'), code: 'const a = <h1 title="Dev">Dev pages</h1>;' },
    { filename: join(repoRoot, 'apps/web/src/app/dev/page.tsx'), code: 'export const metadata = { title: "Dev pages" };\nconst a = <Btn label="Xóa">{"Quá " + n}</Btn>;' },
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
    { filename: page, code: 'const a = <Btn label="Xóa tài sản" />;', errors: attribute('label') },
    { filename: page, code: 'const a = <Btn label="Delete" />;', errors: attribute('label') },
    { filename: page, code: 'const a = <Card description="Mô tả" />;', errors: attribute('description') },
    { filename: page, code: 'const a = <Figure caption="Ảnh" />;', errors: attribute('caption') },
    { filename: page, code: 'const a = <Section heading="Tổng quan" />;', errors: attribute('heading') },
    { filename: page, code: 'const a = <Toast message="Đã lưu" />;', errors: attribute('message') },
    { filename: page, code: 'const a = <Chip text="Mới" />;', errors: attribute('text') },
    { filename: page, code: 'const a = <Field helperText="Không bắt buộc" />;', errors: attribute('helperText') },
    { filename: page, code: 'const a = <div aria-description="Bảng giá" />;', errors: attribute('aria-description') },
    { filename: page, code: 'const a = <div role="slider" aria-valuetext="Năm" />;', errors: attribute('aria-valuetext') },
    { filename: page, code: 'const a = <option value="vi" label="Tiếng Việt" />;', errors: attribute('label') },
    { filename: page, code: 'const a = <Btn label={cond ? "Xóa" : t("keep")} />;', errors: attribute('label') },
    { filename: page, code: 'const a = <Btn hint="Bấm để xóa" />;', errors: attribute('hint') },
    { filename: page, code: 'const a = <Badge status="Quá" />;', errors: attribute('status') },
    { filename: page, code: 'const a = <Badge status="paid late" />;', errors: attribute('status') },
    { filename: page, code: "const a = <p>{'Quá hạn ' + n}</p>;", errors: text },
    { filename: page, code: "const a = <p>{n + ' ngày'}</p>;", errors: text },
    { filename: page, code: 'const L = "Quá hạn";\nconst a = <p>{L}</p>;', errors: text },
    { filename: page, code: 'const L = `Quá hạn`;\nfunction A() { return <p>{L}</p>; }', errors: text },
    { filename: page, code: 'const L = "Quá hạn";\nconst a = <Btn label={L} />;', errors: attribute('label') },
    { filename: layout, code: 'export const metadata = { title: "Esta" };', errors: metadata('title') },
    {
      filename: page,
      code: 'export const metadata: Metadata = { title: { default: "Esta", template: "%s · Esta" }, description: "Sổ cái" };',
      errors: [...metadata('title'), ...metadata('title'), ...metadata('description')],
    },
    {
      filename: page,
      code: 'export const metadata = { openGraph: { title: "Esta" } } satisfies Metadata;',
      errors: metadata('title'),
    },
  ],
});
