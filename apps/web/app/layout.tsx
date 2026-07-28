import { type Metadata } from 'next';
import { type ReactNode } from 'react';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: {
    default: 'Hansys Studio',
    template: '%s · Hansys Studio',
  },
  description: 'Local-first scene-based video studio',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
