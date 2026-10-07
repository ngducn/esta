import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Dev pages',
};

const devPages: readonly { href: string; title: string }[] = [
  { href: '/dev/core', title: 'Core formatting and parsing' },
];

export default function DevIndexPage() {
  return (
    <main>
      <h1>Dev pages</h1>
      {devPages.length === 0 ? (
        <p>No dev pages yet.</p>
      ) : (
        <ul>
          {devPages.map((page) => (
            <li key={page.href}>
              <Link href={page.href}>{page.title}</Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
