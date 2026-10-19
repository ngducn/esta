import {
  cloneOccurrences,
  DEV_ROUTES,
  duplicateExports,
  filesOver,
  matchLines,
  okFalseUnions,
  TEST_FILE,
  type Clone,
  type Corpus,
  type Occurrence,
  type Scope,
} from './measure.ts';

/** A metric with a `cap` fails above it whatever the baseline says, and `--allow-raise` cannot lift it. */
export type Metric = {
  readonly id: string;
  readonly message: string;
  readonly home: string;
  readonly section: string;
  readonly cap?: number;
  readonly measure: (input: MeasureInput) => Occurrence[];
};
export type MeasureInput = { readonly corpus: Corpus; readonly clones: readonly Clone[] };

const SOURCE: Scope = { include: /^(apps\/[^/]+\/src|packages\/[^/]+\/src)\//, exclude: TEST_FILE };
const NOT_PRODUCT = new RegExp(`${TEST_FILE.source}|${DEV_ROUTES.source}`);
const PRODUCT_CODE: Scope = { include: SOURCE.include, exclude: NOT_PRODUCT };
const WEB_UI: Scope = { include: /^apps\/web\/src\/(components|app)\/.*\.tsx$/, exclude: NOT_PRODUCT };
const WEB_SERVER: Scope = { include: /^apps\/web\/src\/(server\/|app\/|proxy\.ts$)/, exclude: NOT_PRODUCT };
const E2E_SPECS: Scope = { include: /^e2e\//, exclude: /^e2e\/helpers\// };
const EVERY_FILE: Scope = { include: /./ };

type PatternSmell = Omit<Metric, 'measure'> & { readonly scope: Scope; readonly pattern: RegExp };

const pattern = ({ scope, pattern: regex, ...metric }: PatternSmell): Metric => ({
  ...metric,
  measure: ({ corpus }) => matchLines(corpus, without(scope, THE_GATE_ITSELF), regex),
});

const THE_GATE_ITSELF = /^scripts\/quality\//;

const without = (scope: Scope, home: RegExp): Scope => ({
  include: scope.include,
  exclude: scope.exclude === undefined ? home : new RegExp(`${scope.exclude.source}|${home.source}`),
});

export const METRICS: readonly Metric[] = [
  {
    id: 'clones',
    message: 'Copied code: a block of at least 50 tokens that also appears elsewhere.',
    home: 'Extract the shared part once, in the module ARCHITECTURE.md names for that concern, and call it from both places.',
    section: 'duplicated-code',
    measure: ({ clones }) => cloneOccurrences(clones, () => 1),
  },
  {
    id: 'duplicated-lines',
    message: 'Lines inside copied blocks.',
    home: 'Extract the shared part once, in the module ARCHITECTURE.md names for that concern, and call it from both places.',
    section: 'duplicated-code',
    measure: ({ clones }) => cloneOccurrences(clones, (clone) => clone.lines),
  },
  {
    id: 'files-over-1000-lines',
    message: 'A source file over 1,000 lines.',
    home: 'Split the file by concern before it lands.',
    section: 'file-size',
    cap: 0,
    measure: ({ corpus }) => filesOver(corpus, EVERY_FILE, 1000),
  },
  {
    id: 'files-over-400-lines',
    message: 'A source file over 400 lines.',
    home: 'Split the file by concern, or move its helpers to the home ARCHITECTURE.md names.',
    section: 'file-size',
    measure: ({ corpus }) => filesOver(corpus, EVERY_FILE, 400),
  },
  pattern({
    id: 'hand-rolled-action-call',
    message: 'A component calls a server action through its own `startTransition(async …)`, catch and error state.',
    home: '`useWrite` in apps/web/src/components/properties/archive-button.tsx, until issue #193 promotes it to a shared action hook.',
    section: 'calling-a-server-action-from-the-ui',
    scope: without(WEB_UI, /^apps\/web\/src\/components\/use-action\.tsx?$/),
    pattern: /startTransition\(async/g,
  }),
  pattern({
    id: 'action-failure-mapping',
    message: 'A component maps a thrown action to `{ ok: false … }` with its own `.catch`.',
    home: '`useWrite` in apps/web/src/components/properties/archive-button.tsx, until issue #193 adds a shared action hook that owns this mapping.',
    section: 'calling-a-server-action-from-the-ui',
    scope: without(WEB_UI, /^apps\/web\/src\/components\/use-action\.tsx?$/),
    pattern: /\.catch\(\(\) => \(\{ ok: false/g,
  }),
  pattern({
    id: 'local-id-schema',
    message: 'Server code declares its own `z.uuid()` id schema or parses an id ad hoc.',
    home: '`idSchema` and `optionalIdSchema` in apps/web/src/server/actions/kit.ts, which issue #188 creates.',
    section: 'server-action-kit',
    scope: without(WEB_SERVER, /^apps\/web\/src\/server\/actions\/kit\.ts$/),
    pattern: /const \w+ = z\.uuid\(\)|z\.uuid\(\)\.(?:safeParse|parse)\(/g,
  }),
  pattern({
    id: 'sqlstate-literal',
    message: 'A Postgres SQLSTATE code such as `23505` is read outside the one database-refusal helper.',
    home: '`dbRefusal(error, sentinels)` in apps/web/src/server/actions/kit.ts, which issue #188 creates.',
    section: 'server-action-kit',
    scope: without(PRODUCT_CODE, /^apps\/web\/src\/server\/actions\/kit\.ts$/),
    pattern: /'(?:22|23|40|42|P0)[0-9A-Z]{3}'/g,
  }),
  pattern({
    id: 'toast-provider-mount',
    message: 'A page or component mounts its own `UndoToastProvider`.',
    home: 'One provider in apps/web/src/app/(app)/layout.tsx, which issue #191 adds.',
    section: 'toasts',
    scope: without(PRODUCT_CODE, /^apps\/web\/src\/app\/\(app\)\/layout\.tsx$/),
    pattern: /<UndoToastProvider\b/g,
  }),
  pattern({
    id: 'intl-subset-by-hand',
    message: 'A page calls `getMessages()` to hand-pick a client island\'s message subset.',
    home: '`propertyIslandIntl` in apps/web/src/server/properties/island-messages.ts, until issue #192 adds one typed island component.',
    section: 'translation-islands',
    scope: without(PRODUCT_CODE, /^apps\/web\/src\/(i18n\/|server\/properties\/island-messages\.ts$)/),
    pattern: /\bgetMessages\(\)/g,
  }),
  pattern({
    id: 'hand-rolled-lazy-sheet',
    message: 'A sheet is opened with its own `lazy()` state and unmounts on close, so it loses its exit motion and `aria-expanded`.',
    home: '`useDeferredDialog` in apps/web/src/components/use-deferred-dialog.ts.',
    section: 'sheets-and-dialogs',
    scope: WEB_UI,
    pattern: /onOpenChange=\{\(open\) => \(open \?/g,
  }),
  pattern({
    id: 'sheet-footer-markup',
    message: 'A sheet or dialog repeats the footer row markup.',
    home: 'One form-sheet shell that owns the title, error, cancel and submit row, which issue #193 creates.',
    section: 'sheets-and-dialogs',
    scope: WEB_UI,
    pattern: /flex flex-col-reverse gap-3 sm:flex-row sm:justify-end/g,
  }),
  pattern({
    id: 'upload-pipeline',
    message: 'A component sends document bytes itself instead of through the one upload pipeline.',
    home: 'One `useDocumentUpload` hook over apps/web/src/lib/upload/prepare.ts, which issue #190 creates from the two current copies.',
    section: 'document-upload',
    scope: without(PRODUCT_CODE, /^apps\/web\/src\/(lib\/upload\/|components\/documents\/use-document-upload\.tsx?$)/),
    pattern: /\bsendPrepared\(/g,
  }),
  pattern({
    id: 'decimal-parser-outside-parse',
    message: '`parseDecimal`, a money parser that reads `1.255` as 1255, is imported outside the money and parse modules.',
    home: '`parseVndInput` for money; `parseAreaInput` for areas until issue #182 adds one area parser in packages/core/src/parse.',
    section: 'parsing-money-decimals-areas-and-dates',
    scope: without(SOURCE, /^packages\/core\/src\/(money|parse)\//),
    pattern: /import \{[^}]*\bparseDecimal\b[^}]*\} from/g,
  }),
  pattern({
    id: 'hand-rolled-iso-date-schema',
    message: 'A schema re-checks an ISO date with `refine(isIsoDate)` instead of the branded schema.',
    home: '`isoDateSchema` from @esta/core/schemas/legal, which also brands the value (issue #196 moves it to the date module).',
    section: 'parsing-money-decimals-areas-and-dates',
    scope: without(SOURCE, /^packages\/core\/src\/(date\/|schemas\/legal\.ts$)/),
    pattern: /refine\(isIsoDate\)/g,
  }),
  {
    id: 'ad-hoc-result-type',
    message: 'A union with an `{ ok: false … }` arm spells out a result type of its own.',
    home: '`Result<T, Reason>` from @esta/core/result (issue #196 widens it for structured errors).',
    section: 'results',
    measure: ({ corpus }) => okFalseUnions(corpus, without(PRODUCT_CODE, /^packages\/core\/src\/result\.ts$/)),
  },
  {
    id: 'duplicate-core-export',
    message: 'packages/core exports the same name from two modules, so an auto-import can pick the wrong one.',
    home: 'Declare it once, in the module that owns the concept, and import it from there (issue #196 removes the current copies).',
    section: 'one-declaration-per-concept-in-core',
    measure: ({ corpus }) => duplicateExports(corpus, { include: /^packages\/core\/src\//, exclude: TEST_FILE }),
  },
  pattern({
    id: 'double-cast',
    message: '`as unknown as` tells the type checker to stop checking.',
    home: 'Parse with zod at the boundary, or narrow with a type guard.',
    section: 'types-at-boundaries',
    scope: { include: /./, exclude: TEST_FILE },
    pattern: /\bas unknown as\b/g,
  }),
  pattern({
    id: 'inline-eslint-disable',
    message: 'An inline `eslint-disable` comment.',
    home: 'Fix the code, or put the exception in eslint.config.mjs where review sees it.',
    section: 'lint-exceptions',
    scope: { include: /./, exclude: /^eslint-rules\// },
    pattern: /eslint-disable/g,
  }),
  pattern({
    id: 'e2e-axe-in-spec',
    message: 'An e2e spec imports AxeBuilder to define its own accessibility helper.',
    home: '`seriousAxeViolations` in e2e/helpers/wizard.ts (issue #194 moves it to e2e/fixtures.ts).',
    section: 'e2e-helpers',
    scope: E2E_SPECS,
    pattern: /from '@axe-core\/playwright'/g,
  }),
  pattern({
    id: 'e2e-slot-env-in-spec',
    message: 'An e2e spec builds the slot environment itself.',
    home: 'The helpers in e2e/helpers, which read the slot environment once (issue #194 adds e2e/fixtures.ts).',
    section: 'e2e-helpers',
    scope: E2E_SPECS,
    pattern: /\bslotEnv\(/g,
  }),
  pattern({
    id: 'e2e-viewport-in-spec',
    message: 'An e2e spec declares its own `PHONE` or `DESKTOP` viewport.',
    home: '`PHONE` and `DESKTOP` in e2e/helpers/wizard.ts.',
    section: 'e2e-helpers',
    scope: E2E_SPECS,
    pattern: /^\s*const (?:PHONE|DESKTOP) = /g,
  }),
  pattern({
    id: 'e2e-sideways-scroll-in-spec',
    message: 'An e2e spec writes its own sideways-scroll check.',
    home: '`noSidewaysScroll` in e2e/helpers/wizard.ts.',
    section: 'e2e-helpers',
    scope: E2E_SPECS,
    pattern: /scrollWidth <=/g,
  }),
];
