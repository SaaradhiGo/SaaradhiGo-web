import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SaaradhiGo Ops Console',
  description: 'Internal operations console for SaaradhiGo',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
