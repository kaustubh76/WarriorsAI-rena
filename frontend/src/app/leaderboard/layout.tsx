import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Leaderboard',
  description: 'Top prediction market traders on Warriors AI Arena. Compete for seasonal rewards and climb the ranks.',
};

export default function LeaderboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
