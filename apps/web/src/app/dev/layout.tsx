import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { isDevSurfaceEnabled } from '@/server/dev-guard';
import { env } from '@/server/env';

export default function DevLayout({ children }: Readonly<{ children: ReactNode }>) {
  if (!isDevSurfaceEnabled(env)) notFound();
  return children;
}
