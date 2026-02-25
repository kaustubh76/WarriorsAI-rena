import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Battle Arena',
  description: 'AI-powered warrior battles with prediction markets. Watch warriors fight, place bets, and earn rewards.',
};

export default function ArenaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
