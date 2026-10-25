import { parseEstaUri } from '@esta/core/links';
import { gfmTableFromMarkdown } from 'mdast-util-gfm-table';
import { gfmTable } from 'micromark-extension-gfm-table';
import Link from 'next/link';
import { CitationChip } from '@/components/assistant/citation-chip';
import type { ReactNode } from 'react';
import Markdown, { type Components, type Options, type UrlTransform } from 'react-markdown';
import { cn } from '@/lib/utils';

function estaPath(url: string): string | null {
  const route = parseEstaUri(url);
  return route.ok ? `/open/${route.value.type}/${route.value.id}` : null;
}

const ALLOWED = ['p', 'ul', 'ol', 'li', 'strong', 'a', 'br'];
const WITH_TABLES = [...ALLOWED, 'table', 'thead', 'tbody', 'tr', 'th', 'td'];

type Syntax = { settings?: unknown; micromarkExtensions?: unknown[]; fromMarkdownExtensions?: unknown[] };

/** GFM tables and no other GFM syntax, so a bare URL never autolinks (AGENT.md §6.2). */
function remarkTables(this: { data(): Syntax }) {
  const data = this.data();
  (data.micromarkExtensions ??= []).push(gfmTable());
  (data.fromMarkdownExtensions ??= []).push(gfmTableFromMarkdown());
}
const TABLES: Options['remarkPlugins'] = [remarkTables];

/** Keeps only `https:` and resolvable `esta:` links; anything else loses its href and renders as text (SPEC §7.1). */
const keepSafeUrl: UrlTransform = (url) => {
  if (/^https:\/\//i.test(url)) return url;
  return estaPath(url) === null ? null : url;
};

/** An answer's links: only the records its run looked up, as `messages.refs` lists them (#335). */
const keepListed =
  (refs: readonly string[]): UrlTransform =>
  (url) =>
    refs.includes(url) && estaPath(url) !== null ? url : null;

/** "25 ngày" keeps its number and unit on one line in a narrow cell. */
const NUMBER_THEN_WORD = /(\d) (?=\p{L})/gu;
const glueUnits = (node: ReactNode): ReactNode => (typeof node === 'string' ? node.replace(NUMBER_THEN_WORD, '$1\u00a0') : Array.isArray(node) ? node.map(glueUnits) : node);

const components: Components = {
  a: ({ href, children }) => {
    if (typeof href !== 'string' || href === '') return <span>{children}</span>;
    const inApp = estaPath(href);
    if (inApp !== null) {
      return (
        <Link href={inApp} className="font-medium text-ink underline underline-offset-4">
          {children}
        </Link>
      );
    }
    return <CitationChip href={href}>{children}</CitationChip>;
  },
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-small">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-rule px-2 py-2 align-bottom font-medium text-ink">{children}</th>,
  td: ({ children }) => <td className="border-b border-rule px-2 py-2 align-top text-ink-2 figures">{glueUnits(children)}</td>,
};

/**
 * Model output as Markdown limited to text structure. Raw HTML renders as its literal text because no raw HTML
 * plugin runs, and images are dropped so a reply cannot load a remote URL. An answer passes its `refs`: then only
 * those `esta://` links stay live, and GFM tables render.
 */
export function SafeMarkdown({ children, className, refs }: { children: string; className?: string; refs?: readonly string[] }) {
  return (
    <div data-slot="safe-markdown" className={cn('flex flex-col gap-2 text-body break-words text-ink-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6', className)}>
      <Markdown
        urlTransform={refs === undefined ? keepSafeUrl : keepListed(refs)}
        components={components}
        allowedElements={refs === undefined ? ALLOWED : WITH_TABLES}
        unwrapDisallowed
        {...(refs === undefined ? {} : { remarkPlugins: TABLES })}
      >
        {children}
      </Markdown>
    </div>
  );
}
