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
const component = join(repoRoot, 'apps/web/src/components/chart.tsx');

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
    { filename: component, code: 'const a = <Popover containerClassName="flex gap-2" labelClassName="text-ink font-semibold" />;' },
    { filename: component, code: 'const a = <Tabs classNames="tab tab-active" tabClassNames="px-2 py-1" />;' },
    { filename: component, code: 'const a = <svg preserveAspectRatio="xMidYMid meet" viewBox="0 0 24 24" />;' },
    { filename: component, code: 'const a = <meta name="viewport" content="width=device-width, initial-scale=1" />;' },
    { filename: component, code: 'const a = <meta property="og:site_name" content="Sổ cái nhà đất" />;' },
    { filename: component, code: 'const a = <link rel="icon" media="(prefers-color-scheme: dark)" href="/icon-dark.png" />;' },
    { filename: component, code: 'const a = <source srcSet="/a.png 1x, /b.png 2x" sizes="(max-width: 600px) 100vw, 50vw" media="(min-width: 40em)" />;' },
    { filename: component, code: 'const a = <text fontFamily="Be Vietnam Pro, sans-serif" font-family="Be Vietnam Pro" textAnchor="middle">{t("x")}</text>;' },
    { filename: component, code: 'const a = <Chart fontFamily="Be Vietnam Pro, sans-serif" />;' },
    { filename: component, code: 'const a = <path strokeDasharray="4 2" stroke-linecap="round" fill="url(#a b)" transform="translate(1 2) rotate(45)" />;' },
    { filename: component, code: 'const a = <animate attributeName="fill" values="red; blue" calcMode="spline" keySplines="0.5 0 0.5 1" />;' },
    { filename: component, code: 'const a = <Legend style="color: red" labelStyle="font-weight: 600" />;' },
    { filename: component, code: 'const a = <input pattern="[A-Z]{2} [0-9]{3}" inputMode="numeric" autoComplete="street-address line1" accept="image/png, image/jpeg" />;' },
    { filename: component, code: 'const a = <iframe sandbox="allow-scripts allow-forms" allow="camera; microphone" referrerPolicy="no-referrer" />;' },
    { filename: component, code: 'const a = <td headers="col-a col-b" itemType="https://schema.org/Place https://schema.org/Offer" />;' },
    { filename: component, code: 'const a = <use xlinkHref="#icon a" xlink:href="#icon b" />;' },
    { filename: page, code: 'export const metadata = { title: t("x") };' },
    { filename: page, code: 'const KEYS = { late: "late" };\nconst a = <p>{t(KEYS.late)}</p>;' },
    { filename: page, code: 'const a = <p>{[t("a"), t("b")].join(" ")}</p>;' },
    { filename: layout, code: 'export async function generateMetadata() {\n  const t = await getTranslations("app");\n  return { title: t("name") };\n}' },
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
    { filename: component, code: 'const a = <Popover content="Xóa tài sản này?" />;', errors: attribute('content') },
    { filename: component, code: 'const a = <Chart emptyState="Chưa có dữ liệu" />;', errors: attribute('emptyState') },
    { filename: layout, code: 'export const metadata = { title: "Esta" };', errors: metadata('title') },
    { filename: page, code: 'const LABELS = { late: "Quá hạn" };\nconst a = <p>{LABELS.late}</p>;', errors: text },
    { filename: page, code: 'const LABELS = { late: "Quá hạn", paid: "Đã trả" } as const;\nconst a = <Badge label={LABELS[status]} />;', errors: attribute('label') },
    { filename: page, code: 'const a = <p>{["Quá", "hạn"].join(" ")}</p>;', errors: text },
    { filename: layout, code: 'export async function generateMetadata() {\n  return { title: "Esta" };\n}', errors: metadata('title') },
    { filename: page, code: 'export const generateMetadata = async () => ({ description: "Sổ cái" });', errors: metadata('description') },
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
