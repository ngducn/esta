import type { Metadata } from 'next';
import { formatVnd } from '@esta/core/format';
import { vnd } from '@esta/core/money';
import { contrastRatio } from '@/design/contrast';
import { glyphTestString } from '@/design/glyph-test-string';
import { colorPairs, minimumRatio, type ColorPair } from '@/design/text-pairs';
import { colors, statuses, typefaces, type Theme } from '@/design/tokens';
import { StatusShape } from './status-shape';

export const metadata: Metadata = {
  title: 'Glyphs and tokens',
};

const WEIGHT_CLASS: Record<number, string> = {
  400: 'font-normal',
  500: 'font-medium',
  600: 'font-semibold',
  700: 'font-bold',
};
const FACE_CLASS = { sans: 'font-sans' } as const;
const SPECIMEN_SIZES = [
  { px: 16, rem: '1rem' },
  { px: 32, rem: '2rem' },
] as const;
const AMOUNTS = [1_111_111, 8_888_888, 3_500_000, 150_000, 12_450_000, 980_000_000].map(vnd);
const THEMES: readonly Theme[] = ['light', 'dark'];

const faces = Object.entries(typefaces) as [keyof typeof typefaces, (typeof typefaces)[keyof typeof typefaces]][];

function ratio(pair: Pick<ColorPair, 'foreground' | 'background'>, theme: Theme): number {
  return contrastRatio(colors[pair.foreground][theme], colors[pair.background][theme]);
}

function Ratios({ pair, minimum }: { pair: Pick<ColorPair, 'foreground' | 'background'>; minimum: number }) {
  return (
    <dl className="figures grid grid-cols-[auto_auto] justify-end gap-x-3 text-small text-ink-muted">
      {THEMES.map((theme) => {
        const shown = ratio(pair, theme).toFixed(2);
        return (
          <div key={theme} className="contents" data-theme-ratio={theme}>
            <dt>{theme}</dt>
            <dd className="text-right text-ink" data-ratio={shown}>
              {shown}:1
            </dd>
          </div>
        );
      })}
      <dt>min</dt>
      <dd className="text-right">{minimum.toFixed(1)}:1</dd>
    </dl>
  );
}

const sectionClass = 'flex flex-col gap-4 border-t border-rule pt-6';
const headingClass = 'font-sans text-h3 font-semibold';

export default function DevGlyphsPage() {
  const checks = colorPairs.flatMap((pair) => THEMES.map((theme) => ratio(pair, theme) >= minimumRatio[pair.kind]));
  const passing = checks.filter(Boolean).length;
  return (
    <main lang="en" className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-h1">Glyphs and tokens</h1>
        <p className="max-w-prose text-ink-muted">
          The DESIGN-BRIEF §5.1 glyph string in every face and weight the tokens use, the figure column, and every color
          pair with its contrast ratio in both themes.
        </p>
        <p className="figures font-semibold" data-testid="contrast-summary">
          {passing}/{checks.length} pair checks pass across light and dark
        </p>
      </header>

      <section aria-labelledby="faces-heading" className={sectionClass}>
        <h2 id="faces-heading" className={headingClass}>
          Faces
        </h2>
        {faces.map(([key, face]) => (
          <div key={key} className="flex flex-col gap-4">
            <h3 className="text-lead font-semibold">
              {face.family} <span className="font-normal text-ink-muted">({key})</span>
            </h3>
            {face.weights.map((weight) =>
              SPECIMEN_SIZES.map((size) => (
                <figure key={`${weight}-${size.px}`} className="flex flex-col gap-1">
                  <figcaption className="figures text-meta text-ink-muted">
                    {weight} · {size.px} px
                  </figcaption>
                  <p
                    className={`${FACE_CLASS[key]} ${WEIGHT_CLASS[weight]} leading-snug wrap-anywhere`}
                    style={{ fontSize: size.rem }}
                    data-face={key}
                    data-weight={weight}
                    data-size={size.px}
                  >
                    {glyphTestString}
                  </p>
                </figure>
              )),
            )}
          </div>
        ))}
      </section>

      <section aria-labelledby="figures-heading" className={sectionClass}>
        <h2 id="figures-heading" className={headingClass}>
          Figures
        </h2>
        <div className="flex flex-wrap items-end gap-x-16 gap-y-8">
          <table className="figures text-lead" data-testid="figure-column" aria-label="Amounts, right-aligned">
            <tbody>
              {AMOUNTS.map((amount) => (
                <tr key={amount} className="border-b border-rule last:border-b-0">
                  <td className="py-2 text-right" data-amount={amount}>
                    <span>{formatVnd(amount, 'vi')}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-col gap-1" style={{ fontSize: '2rem' }}>
            <p className="font-medium leading-tight" data-testid="specimen-name">
              Đặng Thị Hường
            </p>
            <p className="figures font-semibold leading-tight" data-testid="specimen-amount">
              {formatVnd(vnd(3_500_000), 'vi')}
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="status-heading" className={sectionClass}>
        <h2 id="status-heading" className={headingClass}>
          Status
        </h2>
        <ul className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {statuses.map((status) => (
            <li key={status} className="flex items-start justify-between gap-4" data-status={status}>
              <span className="flex items-center gap-2">
                <StatusShape status={status} />
                <span className="font-semibold" style={{ color: `var(--${status})` }}>
                  {status}
                </span>
              </span>
              <div className="flex gap-6">
                <div data-kind="text" className="flex flex-col items-end gap-1">
                  <p className="text-meta text-ink-muted">word on ground</p>
                  <Ratios pair={{ foreground: status, background: 'ground' }} minimum={minimumRatio.text} />
                </div>
                <div data-kind="text" className="flex flex-col items-end gap-1">
                  <p className="text-meta text-ink-muted">word on fill</p>
                  <Ratios pair={{ foreground: status, background: `${status}-fill` }} minimum={minimumRatio.text} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="pairs-heading" className={sectionClass}>
        <h2 id="pairs-heading" className={headingClass}>
          Color pairs
        </h2>
        <ul className="flex flex-col">
          {colorPairs.map((pair) => (
            <li
              key={`${pair.kind}-${pair.foreground}-${pair.background}`}
              className="flex flex-wrap items-center justify-between gap-4 border-b border-rule py-3"
              data-pair={`${pair.foreground}/${pair.background}`}
            >
              <div
                className="flex min-h-touch items-center gap-3 px-4"
                style={{ backgroundColor: `var(--${pair.background})` }}
              >
                {pair.kind === 'text' ? (
                  <span style={{ color: `var(--${pair.foreground})` }}>Đặng Thị Hường 3.500.000 ₫</span>
                ) : (
                  <span className="size-6 rounded-xs border-2" style={{ borderColor: `var(--${pair.foreground})` }} />
                )}
              </div>
              <p className="flex-1 text-small">
                {pair.foreground} on {pair.background} <span className="text-ink-muted">({pair.kind})</span>
              </p>
              <Ratios pair={pair} minimum={minimumRatio[pair.kind]} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
