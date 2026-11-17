import type { Metadata } from 'next';
import { DesignSystem } from '@/components/ui/DesignSystem';

// The standard, for the team (owner brief, 17 Nov 2026). Not for search engines.
export const metadata: Metadata = {
  title: 'Design standard — SaaradhiGo',
  robots: { index: false, follow: false },
};

export default function DesignPage() {
  return <DesignSystem />;
}
