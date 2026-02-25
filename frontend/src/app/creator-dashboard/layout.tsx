import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Creator Dashboard',
  description: 'Track your creator earnings, manage your tier progress, and claim CRwN rewards on Warriors AI Arena.',
};

export default function CreatorDashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
