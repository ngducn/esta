import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { formatDateLong } from '@esta/core/format';
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
        <p data-testid="date-line">{formatDateLong(clock.today(), 'vi')}</p>
        {children}
      </body>
    </html>
  );
}
