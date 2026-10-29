import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Space — Your workplace, connected.',
  description: 'A virtual workplace for people and AI agents.',
};
export const viewport: Viewport = { themeColor: '#f6f3f0' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
