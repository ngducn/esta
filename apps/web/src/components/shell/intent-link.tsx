'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ComponentProps } from 'react';

/** Prefetches on hover, touch or focus instead of on render, so the shell's links stay off the network while the first screen loads. */
export function IntentLink({ href, ...props }: Omit<ComponentProps<typeof Link>, 'href' | 'prefetch'> & { href: string }) {
  const router = useRouter();
  const prefetch = () => router.prefetch(href);
  return <Link href={href} prefetch={false} onMouseEnter={prefetch} onTouchStart={prefetch} onFocus={prefetch} {...props} />;
}
