import Link from 'next/link';
import Markdown, { type Components, type UrlTransform } from 'react-markdown';
import { cn } from '@/lib/utils';

/** In-app routes for `esta://<type>/<id>` record links in agent output (AGENT.md §5.6). */
const ESTA_ROUTES: Readonly<Record<string, string>> = { property: '/properties' };

const ESTA_LINK = /^esta:\/\/([a-z_]+)\/([0-9A-Za-z-]+)$/;

function estaPath(url: string): string | null {
  const match = ESTA_LINK.exec(url);
  const route = match?.[1] === undefined ? undefined : ESTA_ROUTES[match[1]];
  return route === undefined || match?.[2] === undefined ? null : `${route}/${match[2]}`;
}

/** Keeps only `https:` and resolvable `esta:` links; anything else loses its href and renders as text (SPEC §7.1). */
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
        <Link href={inApp} className="font-semibold text-ink underline underline-offset-4">
          {children}
        </Link>
      );
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline underline-offset-4">
        {children}
      </a>
    );
  },
};

/**
 * Model output as Markdown limited to text structure. Raw HTML renders as its literal text because no raw HTML
 * plugin runs, and images are dropped so a reply cannot load a remote URL.
 */
export function SafeMarkdown({ children, className }: { children: string; className?: string }) {
  return (
    <div data-slot="safe-markdown" className={cn('flex flex-col gap-2 text-body break-words text-ink-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6', className)}>
      <Markdown urlTransform={keepSafeUrl} components={components} disallowedElements={['img']} unwrapDisallowed>
        {children}
      </Markdown>
    </div>
  );
}
