'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useScheduledBattles } from '@/hooks/useScheduledBattles';
import { ScheduledTransactionCard } from '@/components/flow/ScheduledTransactionCard';
import { ScheduleBattleModal } from '@/components/flow/ScheduleBattleModal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, Clock, Swords, TrendingUp, Calendar } from 'lucide-react';

export default function FlowScheduledPage() {
  const {
    pendingBattles,
    readyBattles,
    allBattles,
    loading,
    error,
    scheduling,
    executing,
    cancelling,
    scheduleBattle,
    executeBattle,
    cancelBattle,
    refresh,
  } = useScheduledBattles();

  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'ready' | 'executed'>('all');

  // Filter battles based on selected filter
  const filteredBattles = allBattles.filter((battle) => {
    if (filter === 'all') return true;
    if (filter === 'pending') return !battle.executed && !battle.cancelled && new Date() < battle.scheduledTime;
    if (filter === 'ready') return !battle.executed && !battle.cancelled && new Date() >= battle.scheduledTime;
    if (filter === 'executed') return battle.executed;
    return true;
  });

  const executedCount = allBattles.filter((b) => b.executed).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900">
      <main className="container-arcade py-6 md:py-8">
        {/* Back Link */}
        <div className="mb-6">
          <Link href="/arena" className="text-blue-400 hover:text-blue-300 transition-colors">
            ← Back to Arena
          </Link>
        </div>

        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4 animate-fade-in">
            Flow Scheduled Transactions
          </h1>
          <p className="text-lg text-slate-400 mb-8 animate-fade-in" style={{ animationDelay: '100ms' }}>
            Trustless, automated battle execution on Flow testnet
          </p>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card className="p-6 bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700 animate-slide-up">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-400">Pending Battles</span>
                <Clock className="h-5 w-5 text-purple-400" />
              </div>
              <div className="text-3xl font-bold text-white">{pendingBattles.length}</div>
              <p className="text-xs text-slate-500 mt-1">Scheduled for future</p>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700 animate-slide-up" style={{ animationDelay: '50ms' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-400">Ready to Execute</span>
                <Swords className="h-5 w-5 text-green-400" />
              </div>
              <div className="text-3xl font-bold text-white">{readyBattles.length}</div>
              <p className="text-xs text-slate-500 mt-1">Can execute now</p>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700 animate-slide-up" style={{ animationDelay: '100ms' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-400">Total Executed</span>
                <Calendar className="h-5 w-5 text-gold-400" />
              </div>
              <div className="text-3xl font-bold text-white">{executedCount}</div>
              <p className="text-xs text-slate-500 mt-1">Battles completed</p>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700 animate-slide-up" style={{ animationDelay: '150ms' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-400">Gas Saved</span>
                <TrendingUp className="h-5 w-5 text-blue-400" />
              </div>
              <div className="text-3xl font-bold text-white">99.8%</div>
              <p className="text-xs text-slate-500 mt-1">vs traditional bots</p>
            </Card>
          </div>
        </div>

        {/* Filter/Actions Section */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
          {/* Filter Tabs */}
          <div className="flex gap-2">
            <Button
              variant={filter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('all')}
              className={filter === 'all' ? 'bg-purple-500 hover:bg-purple-600' : ''}
            >
              All ({allBattles.length})
            </Button>
            <Button
              variant={filter === 'pending' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('pending')}
              className={filter === 'pending' ? 'bg-purple-500 hover:bg-purple-600' : ''}
            >
              Pending ({pendingBattles.length})
            </Button>
            <Button
              variant={filter === 'ready' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('ready')}
              className={filter === 'ready' ? 'bg-purple-500 hover:bg-purple-600' : ''}
            >
              Ready ({readyBattles.length})
            </Button>
            <Button
              variant={filter === 'executed' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('executed')}
              className={filter === 'executed' ? 'bg-purple-500 hover:bg-purple-600' : ''}
            >
              Executed ({executedCount})
            </Button>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={refresh}
              disabled={loading}
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              onClick={() => setShowScheduleModal(true)}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              <Clock className="h-4 w-4 mr-2" />
              Schedule Battle
            </Button>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <Card className="p-6 bg-red-900/20 border-red-500 mb-8">
            <div className="flex items-center gap-3">
              <div className="text-red-400 text-sm">
                <strong>Error:</strong> {error}
              </div>
              <Button variant="outline" size="sm" onClick={refresh}>
                Retry
              </Button>
            </div>
          </Card>
        )}

        {/* Loading State */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-80 rounded-xl" />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredBattles.length === 0 && (
          <Card className="p-12 text-center bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700">
            <Clock className="h-16 w-16 text-slate-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No Scheduled Battles</h3>
            <p className="text-slate-400 mb-6">
              {filter === 'all'
                ? 'Schedule your first battle to get started!'
                : `No ${filter} battles at this time.`}
            </p>
            <Button
              onClick={() => setShowScheduleModal(true)}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              <Clock className="h-4 w-4 mr-2" />
              Schedule Battle
            </Button>
          </Card>
        )}

        {/* Battles Grid */}
        {!loading && filteredBattles.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredBattles.map((battle, index) => (
              <div
                key={battle.id}
                className="animate-slide-up"
                style={{ animationDelay: `${Math.min(index * 50, 300)}ms` }}
              >
                <ScheduledTransactionCard
                  battle={battle}
                  onExecute={executeBattle}
                  onCancel={cancelBattle}
                  executing={executing === battle.id}
                  cancelling={cancelling === battle.id}
                />
              </div>
            ))}
          </div>
        )}

        {/* How It Works Section */}
        <div className="mt-16 mb-8">
          <h2 className="text-3xl font-bold text-white text-center mb-12">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="p-6 bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700 text-center">
              <div className="bg-purple-500/20 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <Clock className="h-8 w-8 text-purple-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">1. Schedule</h3>
              <p className="text-slate-400 text-sm">
                Create a battle with a future timestamp. Transaction is stored on-chain.
              </p>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700 text-center">
              <div className="bg-blue-500/20 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="h-8 w-8 text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">2. Wait</h3>
              <p className="text-slate-400 text-sm">
                Battle stored on-chain. No servers, no bots, zero maintenance required.
              </p>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700 text-center">
              <div className="bg-green-500/20 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <Swords className="h-8 w-8 text-green-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">3. Execute</h3>
              <p className="text-slate-400 text-sm">
                Anyone can trigger execution when scheduled time arrives. Battle executes automatically.
              </p>
            </Card>
          </div>
        </div>

        {/* Benefits Section */}
        <div className="mt-16">
          <h2 className="text-3xl font-bold text-white text-center mb-12">Why Flow Scheduled Transactions?</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="p-6 bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-2">100% Uptime</h3>
              <p className="text-slate-400 text-sm">
                Battles never miss scheduled time. No server downtime, no missed executions.
              </p>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-2">Zero Infrastructure</h3>
              <p className="text-slate-400 text-sm">
                No servers to maintain, no databases to manage. Just blockchain.
              </p>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-2">Trustless Automation</h3>
              <p className="text-slate-400 text-sm">
                Smart contract code guarantees execution. No trust in third parties required.
              </p>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-2">99% Cost Savings</h3>
              <p className="text-slate-400 text-sm">
                Eliminate bot hosting and gas waste. Pay only for actual transactions.
              </p>
            </Card>
          </div>
        </div>

        {/* CTA Section */}
        <div className="mt-16 text-center">
          <Card className="p-12 bg-gradient-to-br from-purple-900/30 to-pink-900/30 border-purple-500/50">
            <h2 className="text-3xl font-bold text-white mb-4">Ready to Try?</h2>
            <p className="text-slate-300 mb-8 max-w-2xl mx-auto">
              Experience the power of Flow's native scheduled transactions. Schedule your first battle and see trustless automation in action.
            </p>
            <Button
              onClick={() => setShowScheduleModal(true)}
              size="lg"
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              <Clock className="h-5 w-5 mr-2" />
              Schedule Your First Battle
            </Button>
          </Card>
        </div>
      </main>

      {/* Schedule Modal */}
      <ScheduleBattleModal
        isOpen={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        onSchedule={scheduleBattle}
        scheduling={scheduling}
      />
    </div>
  );
}
