import { cloneOccurrences, DEV_ROUTES, duplicateExports, filesOver, matchPositions, TEST_FILE, type Clone, type Corpus, type Occurrence, type Scope } from './measure.ts';
import {
  alwaysOpenPopups,
  asyncTransitions,
  catchToFailure,
  doubleCasts,
  failureArms,
  isoDateRefines,
  localIdSchemas,
  pageScrollWidths,
  putFetches,
  sqlstateReads,
  viewports,
} from './smells.ts';
import { classLists, comments, elements, imported, importsModule, uses, type Finder } from './syntax.ts';

export type Helper = { readonly name: string; readonly file: string };

/** What to use instead. Every backticked name in `use` is an exported helper listed here, or a name the pending issue adds. */
export type Home = {
  readonly use: string;
  readonly helpers?: readonly Helper[];
  /** The issue that creates the home when it does not exist yet; until it lands, a change that needs one records a raise. */
  readonly pending?: { readonly issue: number; readonly names: readonly string[] };
};

/** A metric with a `cap` fails above it whatever the baseline says, and `--allow-raise` cannot lift it. */
export type Metric = {
  readonly id: string;
  readonly message: string;
  readonly home: Home;
  readonly section: string;
  readonly cap?: number;
  readonly measure: (input: MeasureInput) => Occurrence[];
};
export type MeasureInput = { readonly corpus: Corpus; readonly clones: readonly Clone[] };

const NOT_PRODUCT = new RegExp(`${TEST_FILE.source}|${DEV_ROUTES.source}`);
const PRODUCT_CODE: Scope = { include: /^(apps\/[^/]+\/src|packages\/[^/]+\/src)\//, exclude: NOT_PRODUCT };
const WEB_CLIENT: Scope = { include: /^apps\/web\/src\/(?!server\/)/, exclude: NOT_PRODUCT };
const WEB_UI: Scope = { include: /^apps\/web\/src\/(components|app)\/.*\.tsx$/, exclude: NOT_PRODUCT };
const WEB_SERVER: Scope = { include: /^apps\/web\/src\/(server\/|app\/|proxy\.ts$)/, exclude: NOT_PRODUCT };
const E2E_SPECS: Scope = { include: /^e2e\//, exclude: /^e2e\/helpers\// };
const EVERY_FILE: Scope = { include: /./ };
const NOT_TESTS: Scope = { include: /./, exclude: TEST_FILE };

const without = (scope: Scope, home: RegExp): Scope => ({
  include: scope.include,
  exclude: scope.exclude === undefined ? home : new RegExp(`${scope.exclude.source}|${home.source}`),
});

type SyntaxSmell = Omit<Metric, 'measure'> & { readonly scope: Scope; readonly find: Finder };

const syntax = ({ scope, find, ...metric }: SyntaxSmell): Metric => ({
  ...metric,
  measure: ({ corpus }) => matchPositions(corpus, scope, (source) => find(source).map((node) => node.getStart(source))),
});

const EXTRACT: Home = { use: 'Extract the shared part once, in the module ARCHITECTURE.md names for that concern, and call it from both places.' };
const ACTION_HOOK: Home = {
  use: 'The shared action hook `useAction` in apps/web/src/components/use-action.ts, which issue #193 creates.',
  pending: { issue: 193, names: ['useAction'] },
};
const ACTION_KIT = { issue: 188, names: ['idSchema', 'optionalIdSchema', 'dbRefusal'] };
const WIZARD_HELPERS = 'e2e/helpers/wizard.ts';
const UPLOAD_PRIMITIVES = ['sendPrepared', 'uploadWithProgress', 'createDocumentUpload', 'createSignedUploadUrl', 'uploadToSignedUrl'];

export const METRICS: readonly Metric[] = [
  {
    id: 'clones',
    message: 'Copied code: a block of at least 50 tokens that also appears elsewhere.',
    home: EXTRACT,
    section: 'duplicated-code',
    measure: ({ clones }) => cloneOccurrences(clones, () => 1),
  },
  {
    id: 'duplicated-lines',
    message: 'Lines inside copied blocks.',
    home: EXTRACT,
    section: 'duplicated-code',
    measure: ({ clones }) => cloneOccurrences(clones, (clone) => clone.lines),
  },
  {
    id: 'files-over-1000-lines',
    message: 'A source file over 1,000 lines.',
    home: { use: 'Split the file by concern before it lands.' },
    section: 'file-size',
    cap: 0,
    measure: ({ corpus }) => filesOver(corpus, EVERY_FILE, 1000),
  },
  {
    id: 'files-over-400-lines',
    message: 'A source file over 400 lines.',
    home: { use: 'Split the file by concern, or move its helpers to the home ARCHITECTURE.md names.' },
    section: 'file-size',
    measure: ({ corpus }) => filesOver(corpus, EVERY_FILE, 400),
  },
  syntax({
    id: 'hand-rolled-action-call',
    message: 'Client code runs a server action through its own transition (`start(async …)` from `useTransition`), catch and error state.',
    home: ACTION_HOOK,
    section: 'calling-a-server-action-from-the-ui',
    scope: without(WEB_CLIENT, /^apps\/web\/src\/components\/use-action\.tsx?$/),
    find: asyncTransitions,
  }),
  syntax({
    id: 'action-failure-mapping',
    message: 'Client code maps a thrown action to `{ ok: false … }` with its own `.catch`.',
    home: ACTION_HOOK,
    section: 'calling-a-server-action-from-the-ui',
    scope: without(WEB_CLIENT, /^apps\/web\/src\/components\/use-action\.tsx?$/),
    find: catchToFailure,
  }),
  syntax({
    id: 'local-id-schema',
    message: 'Server code declares its own `z.uuid()` id schema or parses an id ad hoc.',
    home: { use: '`idSchema` and `optionalIdSchema` in apps/web/src/server/actions/kit.ts, which issue #188 creates.', pending: ACTION_KIT },
    section: 'server-action-kit',
    scope: without(WEB_SERVER, /^apps\/web\/src\/server\/actions\/kit\.ts$/),
    find: localIdSchemas,
  }),
  syntax({
    id: 'sqlstate-literal',
    message: 'A database error code is compared with a Postgres SQLSTATE such as `23505` outside the one database-refusal helper.',
    home: { use: '`dbRefusal(error, sentinels)` in apps/web/src/server/actions/kit.ts, which issue #188 creates.', pending: ACTION_KIT },
    section: 'server-action-kit',
    scope: without(PRODUCT_CODE, /^apps\/web\/src\/server\/actions\/kit\.ts$/),
    find: sqlstateReads,
  }),
  syntax({
    id: 'toast-provider-mount',
    message: 'A page or component mounts its own `UndoToastProvider`.',
    home: { use: 'One provider in apps/web/src/app/(app)/layout.tsx, which issue #191 adds.', pending: { issue: 191, names: [] } },
    section: 'toasts',
    scope: without(PRODUCT_CODE, /^apps\/web\/src\/app\/\(app\)\/layout\.tsx$/),
    find: elements('UndoToastProvider'),
  }),
  syntax({
    id: 'intl-subset-by-hand',
    message: "A page calls `getMessages()` to hand-pick a client island's message subset.",
    home: {
      use: '`propertyIslandIntl` in apps/web/src/server/properties/island-messages.ts, until issue #192 adds one typed island component.',
      helpers: [{ name: 'propertyIslandIntl', file: 'apps/web/src/server/properties/island-messages.ts' }],
    },
    section: 'translation-islands',
    scope: without(PRODUCT_CODE, /^apps\/web\/src\/(i18n\/|server\/properties\/island-messages\.ts$)/),
    find: uses('getMessages'),
  }),
  syntax({
    id: 'hand-rolled-lazy-sheet',
    message: 'A sheet or dialog is rendered with a bare `open`, so its parent mounts it only while open and it loses its exit motion and `aria-expanded`.',
    home: { use: '`useDeferredDialog` in apps/web/src/components/use-deferred-dialog.ts.', helpers: [{ name: 'useDeferredDialog', file: 'apps/web/src/components/use-deferred-dialog.ts' }] },
    section: 'sheets-and-dialogs',
    scope: WEB_UI,
    find: alwaysOpenPopups,
  }),
  syntax({
    id: 'sheet-footer-markup',
    message: 'A sheet or dialog repeats the footer row markup.',
    home: { use: 'One form-sheet shell that owns the title, error, cancel and submit row, which issue #193 creates.', pending: { issue: 193, names: [] } },
    section: 'sheets-and-dialogs',
    scope: WEB_UI,
    find: classLists('flex-col-reverse', 'sm:flex-row', 'sm:justify-end'),
  }),
  syntax({
    id: 'upload-pipeline',
    message: 'Code outside the upload module signs an upload or sends document bytes itself.',
    home: {
      use: 'One `useDocumentUpload` hook over apps/web/src/lib/upload/prepare.ts, which issue #190 creates from the two current copies.',
      pending: { issue: 190, names: ['useDocumentUpload'] },
    },
    section: 'document-upload',
    scope: without(PRODUCT_CODE, /^apps\/web\/src\/(lib\/upload\/|server\/documents\/actions\.ts$|components\/documents\/use-document-upload\.tsx?$)/),
    find: (source) => [...uses(...UPLOAD_PRIMITIVES)(source), ...putFetches(source)],
  }),
  syntax({
    id: 'decimal-parser-outside-parse',
    message: '`parseDecimal`, a money parser that reads `1.255` as 1255, is imported outside the money and parse modules.',
    home: {
      use: '`parseVndInput` for money; `parseAreaInput` for areas until issue #182 adds one area parser in packages/core/src/parse.',
      helpers: [
        { name: 'parseVndInput', file: 'packages/core/src/parse/vnd-input.ts' },
        { name: 'parseAreaInput', file: 'packages/core/src/properties/area.ts' },
      ],
    },
    section: 'parsing-money-decimals-areas-and-dates',
    scope: without(PRODUCT_CODE, /^packages\/core\/src\/(money|parse)\//),
    find: imported('parseDecimal'),
  }),
  syntax({
    id: 'hand-rolled-iso-date-schema',
    message: 'A schema re-checks an ISO date with `refine(isIsoDate)` instead of the branded schema.',
    home: {
      use: '`isoDateSchema` from @esta/core/schemas/legal, which also brands the value (issue #196 moves it to the date module).',
      helpers: [{ name: 'isoDateSchema', file: 'packages/core/src/schemas/legal.ts' }],
    },
    section: 'parsing-money-decimals-areas-and-dates',
    scope: without(PRODUCT_CODE, /^packages\/core\/src\/(date\/|schemas\/legal\.ts$)/),
    find: isoDateRefines,
  }),
  syntax({
    id: 'ad-hoc-result-type',
    message: 'A type spells out its own failure arm (`ok: false`) instead of using the shared result type.',
    home: { use: '`Result` from @esta/core/result (issue #196 widens it for structured errors).', helpers: [{ name: 'Result', file: 'packages/core/src/result.ts' }] },
    section: 'results',
    scope: without(PRODUCT_CODE, /^packages\/core\/src\/result\.ts$/),
    find: failureArms,
  }),
  {
    id: 'duplicate-core-export',
    message: 'packages/core exports the same name from two modules, so an auto-import can pick the wrong one.',
    home: { use: 'Declare it once, in the module that owns the concept, and import it from there (issue #196 removes the current copies).' },
    section: 'one-declaration-per-concept-in-core',
    measure: ({ corpus }) => duplicateExports(corpus, { include: /^packages\/core\/src\//, exclude: TEST_FILE }),
  },
  syntax({
    id: 'double-cast',
    message: '`as unknown as` tells the type checker to stop checking.',
    home: { use: 'Parse with zod at the boundary, or narrow with a type guard.' },
    section: 'types-at-boundaries',
    scope: NOT_TESTS,
    find: doubleCasts,
  }),
  {
    id: 'inline-eslint-disable',
    message: 'An inline `eslint-disable` comment.',
    home: { use: 'Fix the code, or put the exception in eslint.config.mjs where review sees it.' },
    section: 'lint-exceptions',
    measure: ({ corpus }) => matchPositions(corpus, { include: /./, exclude: /^eslint-rules\// }, (source) => comments(source, 'eslint-disable').map((range) => range.pos)),
  },
  syntax({
    id: 'e2e-axe-in-spec',
    message: 'An e2e spec imports AxeBuilder to define its own accessibility helper.',
    home: { use: '`seriousAxeViolations` in e2e/helpers/wizard.ts (issue #194 moves it to e2e/fixtures.ts).', helpers: [{ name: 'seriousAxeViolations', file: WIZARD_HELPERS }] },
    section: 'e2e-helpers',
    scope: E2E_SPECS,
    find: importsModule('@axe-core/playwright'),
  }),
  syntax({
    id: 'e2e-slot-env-in-spec',
    message: 'An e2e spec builds the slot environment itself.',
    home: {
      use: '`serviceGet`, `servicePatch` and `rest` in e2e/helpers/wizard.ts, which read the slot environment once (issue #194 adds e2e/fixtures.ts for the rest).',
      helpers: [
        { name: 'serviceGet', file: WIZARD_HELPERS },
        { name: 'servicePatch', file: WIZARD_HELPERS },
        { name: 'rest', file: WIZARD_HELPERS },
      ],
    },
    section: 'e2e-helpers',
    scope: E2E_SPECS,
    find: uses('slotEnv'),
  }),
  syntax({
    id: 'e2e-viewport-in-spec',
    message: 'An e2e spec declares its own `PHONE` or `DESKTOP` viewport, or spells out their sizes.',
    home: {
      use: '`PHONE` and `DESKTOP` in e2e/helpers/wizard.ts.',
      helpers: [
        { name: 'PHONE', file: WIZARD_HELPERS },
        { name: 'DESKTOP', file: WIZARD_HELPERS },
      ],
    },
    section: 'e2e-helpers',
    scope: E2E_SPECS,
    find: viewports,
  }),
  syntax({
    id: 'e2e-sideways-scroll-in-spec',
    message: "An e2e spec reads the page's `scrollWidth` to write its own sideways-scroll check.",
    home: { use: '`noSidewaysScroll` in e2e/helpers/wizard.ts.', helpers: [{ name: 'noSidewaysScroll', file: WIZARD_HELPERS }] },
    section: 'e2e-helpers',
    scope: E2E_SPECS,
    find: pageScrollWidths,
  }),
];
