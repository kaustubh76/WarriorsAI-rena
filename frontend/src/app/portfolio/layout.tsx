import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Portfolio',
  description: 'Track your prediction market positions, claim winnings, and view your trading history on Warriors AI Arena.',
};

export default function PortfolioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
