import { parseEstaUri } from '@esta/core/links';
import Link from 'next/link';
import { CitationChip } from '@/components/assistant/citation-chip';
import Markdown, { type Components, type UrlTransform } from 'react-markdown';
import { cn } from '@/lib/utils';

function estaPath(url: string): string | null {
  const route = parseEstaUri(url);
  return route.ok ? `/open/${route.value.type}/${route.value.id}` : null;
}

const ALLOWED = ['p', 'ul', 'ol', 'li', 'strong', 'a', 'br'];

/** Keeps only `https:` and resolvable `esta:` links; anything else loses its href and renders as text (SPEC §7.1). An `https:` link is a source Trợ lý cites, so it renders as a citation chip. */
const keepSafeUrl: UrlTransform = (url) => {
  if (/^https:\/\//i.test(url)) return url;
  return estaPath(url) === null ? null : url;
};

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
};

/**
 * Model output as Markdown limited to text structure. Raw HTML renders as its literal text because no raw HTML
 * plugin runs, and images are dropped so a reply cannot load a remote URL.
 */
export function SafeMarkdown({ children, className }: { children: string; className?: string }) {
  return (
    <div data-slot="safe-markdown" className={cn('flex flex-col gap-2 text-body break-words text-ink-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6', className)}>
      <Markdown urlTransform={keepSafeUrl} components={components} allowedElements={ALLOWED} unwrapDisallowed>
        {children}
      </Markdown>
    </div>
  );
}
