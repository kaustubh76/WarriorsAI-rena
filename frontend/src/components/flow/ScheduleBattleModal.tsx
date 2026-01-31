'use client';

import { useState, useEffect, useRef } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { ScheduleBattleParams } from '@/lib/flow/cadenceClient';

interface ScheduleBattleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSchedule: (params: ScheduleBattleParams) => Promise<string>;
  scheduling?: boolean;
  defaultWarrior1?: number;
  defaultWarrior2?: number;
  isFlowConnected?: boolean;
  onConnectWallet?: () => void;
}

export function ScheduleBattleModal({
  isOpen,
  onClose,
  onSchedule,
  scheduling = false,
  defaultWarrior1,
  defaultWarrior2,
  isFlowConnected = true,
  onConnectWallet,
}: ScheduleBattleModalProps) {
  const [warrior1Id, setWarrior1Id] = useState(defaultWarrior1 || 1);
  const [warrior2Id, setWarrior2Id] = useState(defaultWarrior2 || 2);
  const [betAmount, setBetAmount] = useState(100);
  const [delay, setDelay] = useState<'1hr' | '1day' | '1week' | 'custom'>('1hr');
  const [customDate, setCustomDate] = useState('');

  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const getScheduledTime = (): Date => {
    if (delay === 'custom' && customDate) {
      return new Date(customDate);
    }

    const now = new Date();
    switch (delay) {
      case '1hr':
        return new Date(now.getTime() + 60 * 60 * 1000);
      case '1day':
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
      case '1week':
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() + 60 * 60 * 1000);
    }
  };

  const handleSchedule = async () => {
    if (!mountedRef.current) return;

    try {
      const scheduledTime = getScheduledTime();
      const scheduledTimestamp = Math.floor(scheduledTime.getTime() / 1000);

      await onSchedule({
        warrior1Id,
        warrior2Id,
        betAmount,
        scheduledTime: scheduledTimestamp,
      });

      if (mountedRef.current) {
        onClose();
      }
    } catch (error) {
      // Error is handled by the hook and displayed via toast
    }
  };

  const scheduledTime = getScheduledTime();
  const minutesFromNow = Math.round((scheduledTime.getTime() - Date.now()) / 60000);

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-md">
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">Schedule Battle</h2>
          <p className="text-slate-400 text-sm">
            Schedule a battle for automatic execution at a future time
          </p>
        </div>

        <div className="space-y-4">
          {/* Wallet Connection Warning */}
          {!isFlowConnected && (
            <div className="bg-purple-900/30 border border-purple-500/50 rounded-lg p-4 flex items-center justify-between">
              <p className="text-sm text-purple-300">Flow Wallet not connected</p>
              {onConnectWallet && (
                <Button
                  onClick={onConnectWallet}
                  size="sm"
                  className="bg-purple-500 hover:bg-purple-600"
                  type="button"
                >
                  Connect
                </Button>
              )}
            </div>
          )}

          {/* Warrior Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Warrior 1 ID
              </label>
              <input
                type="number"
                value={warrior1Id}
                onChange={(e) => setWarrior1Id(parseInt(e.target.value) || 1)}
                min={1}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Warrior 2 ID
              </label>
              <input
                type="number"
                value={warrior2Id}
                onChange={(e) => setWarrior2Id(parseInt(e.target.value) || 2)}
                min={1}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          {/* Bet Amount */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Bet Amount (FLOW)
            </label>
            <input
              type="number"
              value={betAmount}
              onChange={(e) => setBetAmount(parseFloat(e.target.value) || 0)}
              min={0}
              step={10}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Time Presets */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Execution Time
            </label>
            <div className="grid grid-cols-4 gap-2 mt-2">
              <Button
                variant={delay === '1hr' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDelay('1hr')}
                type="button"
                className={delay === '1hr' ? 'bg-purple-500 hover:bg-purple-600' : ''}
              >
                1 Hour
              </Button>
              <Button
                variant={delay === '1day' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDelay('1day')}
                type="button"
                className={delay === '1day' ? 'bg-purple-500 hover:bg-purple-600' : ''}
              >
                1 Day
              </Button>
              <Button
                variant={delay === '1week' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDelay('1week')}
                type="button"
                className={delay === '1week' ? 'bg-purple-500 hover:bg-purple-600' : ''}
              >
                1 Week
              </Button>
              <Button
                variant={delay === 'custom' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDelay('custom')}
                type="button"
                className={delay === 'custom' ? 'bg-purple-500 hover:bg-purple-600' : ''}
              >
                Custom
              </Button>
            </div>
          </div>

          {/* Custom Date Picker */}
          {delay === 'custom' && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Custom Date & Time
              </label>
              <input
                type="datetime-local"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          )}

          {/* Preview */}
          <div className="bg-slate-800 rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium text-slate-300">Scheduled For:</p>
            <p className="text-sm text-slate-400">{scheduledTime.toLocaleString()}</p>
            <p className="text-sm text-slate-400">
              ({minutesFromNow} minutes from now)
            </p>
          </div>

          {/* Gas Estimate */}
          <div className="text-xs text-slate-400 text-center">
            Estimated gas: ~0.001 FLOW
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={scheduling}
              type="button"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSchedule}
              className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
              disabled={scheduling || !isFlowConnected}
              type="button"
            >
              {scheduling ? 'Scheduling...' : !isFlowConnected ? 'Wallet Not Connected' : 'Schedule Battle'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
