import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create Market',
  description: 'Create a new prediction market on Flow blockchain. Set up questions, add liquidity, and start earning creator fees.',
};

export default function CreateMarketLayout({ children }: { children: React.ReactNode }) {
  return children;
}
