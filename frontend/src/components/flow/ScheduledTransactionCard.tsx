'use client';

import { useState, useEffect } from 'react';
import { ScheduledBattle } from '@/lib/flow/cadenceClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import Link from 'next/link';

interface ScheduledTransactionCardProps {
  battle: ScheduledBattle;
  onExecute?: (battleId: number) => void;
  onCancel?: (battleId: number) => void;
  executing?: boolean;
  cancelling?: boolean;
}

export function ScheduledTransactionCard({
  battle,
  onExecute,
  onCancel,
  executing = false,
  cancelling = false,
}: ScheduledTransactionCardProps) {
  const [timeUntilExecution, setTimeUntilExecution] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);

  // Update countdown every second
  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const scheduled = battle.scheduledTime;
      const diff = scheduled.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeUntilExecution('Ready to execute');
        setProgressPercent(100);
        return;
      }

      // Calculate time components
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      // Format countdown
      if (days > 0) {
        setTimeUntilExecution(`${days}d ${hours}h`);
      } else if (hours > 0) {
        setTimeUntilExecution(`${hours}h ${minutes}m`);
      } else if (minutes > 0) {
        setTimeUntilExecution(`${minutes}m ${seconds}s`);
      } else {
        setTimeUntilExecution(`${seconds}s`);
      }

      // Calculate progress (assuming 24 hours max for progress bar)
      const createdTime = scheduled.getTime() - 24 * 60 * 60 * 1000; // Assume created 24h before
      const totalTime = scheduled.getTime() - createdTime;
      const elapsed = now.getTime() - createdTime;
      setProgressPercent(Math.min(Math.max((elapsed / totalTime) * 100, 0), 100));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [battle.scheduledTime]);

  // Determine status
  const isReady = new Date() >= battle.scheduledTime && !battle.executed && !battle.cancelled;
  const status = battle.executed
    ? 'executed'
    : battle.cancelled
    ? 'cancelled'
    : isReady
    ? 'ready'
    : 'pending';

  // Status badge variant
  const badgeVariant =
    status === 'executed'
      ? 'default'
      : status === 'ready'
      ? 'default'
      : status === 'cancelled'
      ? 'secondary'
      : 'secondary';

  const badgeColor =
    status === 'executed'
      ? 'bg-gold-500 text-black'
      : status === 'ready'
      ? 'bg-green-500 text-white'
      : status === 'cancelled'
      ? 'bg-gray-500 text-white'
      : 'bg-purple-500 text-white';

  return (
    <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-700 hover:border-purple-500 transition-all duration-200 group">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="space-y-1">
          <Badge className={badgeColor}>{status.toUpperCase()}</Badge>
          <div className="text-sm text-slate-400">Battle ID: #{battle.id}</div>
        </div>
        <div className="text-xs text-slate-500">
          {battle.scheduledTime.toLocaleDateString()}
        </div>
      </div>

      {/* Battle Info */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between">
          <span className="text-white font-medium">Warrior #{battle.warrior1Id}</span>
          <span className="text-slate-400">vs</span>
          <span className="text-white font-medium">Warrior #{battle.warrior2Id}</span>
        </div>
        <div className="text-sm text-slate-400">Bet: {battle.betAmount} FLOW</div>
        {battle.creator && (
          <div className="text-xs text-slate-500">
            Creator: {battle.creator.slice(0, 8)}...{battle.creator.slice(-6)}
          </div>
        )}
      </div>

      {/* Countdown Timer (only for pending/ready battles) */}
      {!battle.executed && !battle.cancelled && (
        <div
          className={`rounded-lg p-3 mb-4 ${
            isReady ? 'bg-green-900/30' : 'bg-slate-800'
          }`}
        >
          <div className="text-center">
            <div
              className={`text-2xl font-bold ${
                isReady ? 'text-green-400' : 'text-purple-400'
              }`}
            >
              {timeUntilExecution}
            </div>
            <div className="text-xs text-slate-400">
              {isReady ? 'ready now' : 'until execution'}
            </div>
          </div>
        </div>
      )}

      {/* Progress Bar (only for pending battles) */}
      {status === 'pending' && (
        <Progress value={progressPercent} className="mb-4 h-2" />
      )}

      {/* Actions */}
      <div className="flex gap-2 mb-4">
        {status === 'ready' && onExecute && (
          <Button
            onClick={() => onExecute(battle.id)}
            className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            disabled={executing}
          >
            {executing ? 'Executing...' : 'Execute Now'}
          </Button>
        )}
        {status === 'pending' && onCancel && (
          <Button
            onClick={() => onCancel(battle.id)}
            variant="ghost"
            className="flex-1 hover:bg-gray-800"
            disabled={cancelling}
          >
            {cancelling ? 'Cancelling...' : 'Cancel'}
          </Button>
        )}
        {status === 'executed' && (
          <div className="flex-1 text-center text-green-400 text-sm font-medium py-2">
            ✓ Battle Completed
          </div>
        )}
        {status === 'cancelled' && (
          <div className="flex-1 text-center text-gray-400 text-sm font-medium py-2">
            Battle Cancelled
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="pt-4 border-t border-gray-700">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>
            Scheduled: {battle.scheduledTime.toLocaleString()}
          </span>
          {battle.transactionId && (
            <Link
              href={`https://testnet.flowdiver.io/tx/${battle.transactionId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-purple-400 transition-colors"
            >
              View TX →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
