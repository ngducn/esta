import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { isDevSurfaceEnabled } from '@/server/dev-guard';
import { env } from '@/server/env';

export default async function DevLayout({ children }: Readonly<{ children: ReactNode }>) {
  await connection();
  if (!isDevSurfaceEnabled(env)) notFound();
  return children;
}
