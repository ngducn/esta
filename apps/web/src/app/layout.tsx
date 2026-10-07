import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getClock } from '@/server/clock';
import './globals.css';

export const metadata: Metadata = {
  title: 'Esta',
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const clock = await getClock();
  return (
    <html lang="vi">
      <body>
        <p data-testid="date-line">{clock.today()}</p>
        {children}
      </body>
    </html>
  );
}
