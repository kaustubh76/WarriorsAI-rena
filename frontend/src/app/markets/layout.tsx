import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Prediction Markets',
  description: 'Browse and trade prediction markets on Flow blockchain. Create markets, place bets, and earn CRwN tokens.',
};

export default function MarketsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
