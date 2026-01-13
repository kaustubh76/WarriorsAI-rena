/**
 * Custom hooks for AI Debate functionality
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, formatEther, type Address } from 'viem';
import { formatTokenAmount } from '@/utils/format';
import debateService, {
  type DebateState,
  type DebateDisplay,
  type Prediction,
  type PredictionDisplay,
  type Rebuttal,
  type ConsensusResult,
  type ConsensusBreakdown,
  type DebateTimelineEvent,
  type DebatePhase,
  type AgentDebateStats
} from '@/services/debateService';
import { AIDebateOracleAbi, crownTokenAbi } from '@/constants';

/**
 * Hook to fetch debate state for a market
 */
export function useDebate(
  debateId: bigint | null,
  marketId: bigint | null,
  battleId: bigint | null
) {
  const [debate, setDebate] = useState<DebateDisplay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDebate = useCallback(async () => {
    if (debateId === null || marketId === null || battleId === null) return;

    try {
      setLoading(true);
      const debateData = await debateService.getDebateWithDisplay(debateId, marketId, battleId);
      setDebate(debateData);
      setError(null);
    } catch (err) {
      setError('Failed to fetch debate');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [debateId, marketId, battleId]);

  useEffect(() => {
    fetchDebate();
    // Refresh every 10 seconds for active debates
    const interval = setInterval(fetchDebate, 10000);
    return () => clearInterval(interval);
  }, [fetchDebate]);

  return {
    debate,
    loading,
    error,
    refetch: fetchDebate
  };
}

/**
 * Hook to get debate phase
 */
export function useDebatePhase(debateId: bigint | null) {
  const [phase, setPhase] = useState<DebatePhase>(0);
  const [loading, setLoading] = useState(true);

  const fetchPhase = useCallback(async () => {
    if (debateId === null) return;

    try {
      setLoading(true);
      const phaseData = await debateService.getDebatePhase(debateId);
      setPhase(phaseData);
    } catch (err) {
      console.error('Error fetching debate phase:', err);
    } finally {
      setLoading(false);
    }
  }, [debateId]);

  useEffect(() => {
    fetchPhase();
    // Refresh every 5 seconds
    const interval = setInterval(fetchPhase, 5000);
    return () => clearInterval(interval);
  }, [fetchPhase]);

  const isActive = phase > 0 && phase < 5;
  const isFinalized = phase === 5;

  return {
    phase,
    isActive,
    isFinalized,
    loading,
    refetch: fetchPhase
  };
}

/**
 * Hook to get debate consensus
 */
export function useDebateConsensus(debateId: bigint | null) {
  const [consensus, setConsensus] = useState<ConsensusResult | null>(null);
  const [breakdown, setBreakdown] = useState<ConsensusBreakdown[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConsensus = useCallback(async () => {
    if (debateId === null) return;

    try {
      setLoading(true);
      const [consensusData, breakdownData] = await Promise.all([
        debateService.getDebateConsensus(debateId),
        debateService.getConsensusBreakdown(debateId)
      ]);
      setConsensus(consensusData);
      setBreakdown(breakdownData);
    } catch (err) {
      console.error('Error fetching debate consensus:', err);
    } finally {
      setLoading(false);
    }
  }, [debateId]);

  useEffect(() => {
    fetchConsensus();
    // Refresh every 10 seconds
    const interval = setInterval(fetchConsensus, 10000);
    return () => clearInterval(interval);
  }, [fetchConsensus]);

  const confidencePercent = consensus ? Number(consensus.confidence) / 100 : 0;
  const isConsensusReached = consensus !== null && consensus.totalWeight > BigInt(0);

  return {
    consensus,
    breakdown,
    confidencePercent,
    isConsensusReached,
    loading,
    refetch: fetchConsensus
  };
}

/**
 * Hook to get predictions for a debate
 * Uses refs for Maps to avoid infinite re-renders
 */
export function useDebatePredictions(
  debateId: bigint | null,
  agentNameMap?: Map<bigint, string>,
  agentTierMap?: Map<bigint, string>
) {
  const [predictions, setPredictions] = useState<PredictionDisplay[]>([]);
  const [participants, setParticipants] = useState<bigint[]>([]);
  const [loading, setLoading] = useState(true);

  // Use refs for Maps to avoid triggering re-renders
  const nameMapRef = useRef(agentNameMap);
  const tierMapRef = useRef(agentTierMap);

  // Update refs when props change
  useEffect(() => {
    nameMapRef.current = agentNameMap;
    tierMapRef.current = agentTierMap;
  }, [agentNameMap, agentTierMap]);

  const fetchPredictions = useCallback(async () => {
    if (debateId === null) return;

    try {
      setLoading(true);
      const participantIds = await debateService.getDebateParticipants(debateId);
      setParticipants(participantIds);

      const nameMap = nameMapRef.current ?? new Map();
      const tierMap = tierMapRef.current ?? new Map();
      const predictionData = await debateService.getPredictionsWithDisplay(debateId, nameMap, tierMap);
      setPredictions(predictionData);
    } catch (err) {
      console.error('Error fetching debate predictions:', err);
    } finally {
      setLoading(false);
    }
  }, [debateId]);

  useEffect(() => {
    fetchPredictions();
    // Refresh every 10 seconds
    const interval = setInterval(fetchPredictions, 10000);
    return () => clearInterval(interval);
  }, [fetchPredictions]);

  const yesCount = predictions.filter(p => p.outcome === 1).length;
  const noCount = predictions.filter(p => p.outcome === 2).length;

  return {
    predictions,
    participants,
    participantCount: participants.length,
    yesCount,
    noCount,
    loading,
    refetch: fetchPredictions
  };
}

/**
 * Hook to get rebuttals for a debate
 */
export function useDebateRebuttals(debateId: bigint | null) {
  const [rebuttals, setRebuttals] = useState<Rebuttal[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRebuttals = useCallback(async () => {
    if (debateId === null) return;

    try {
      setLoading(true);
      const rebuttalData = await debateService.getDebateRebuttals(debateId);
      setRebuttals(rebuttalData);
    } catch (err) {
      console.error('Error fetching debate rebuttals:', err);
    } finally {
      setLoading(false);
    }
  }, [debateId]);

  useEffect(() => {
    fetchRebuttals();
    // Refresh every 10 seconds
    const interval = setInterval(fetchRebuttals, 10000);
    return () => clearInterval(interval);
  }, [fetchRebuttals]);

  return {
    rebuttals,
    rebuttalCount: rebuttals.length,
    loading,
    refetch: fetchRebuttals
  };
}

/**
 * Hook to build debate timeline
 */
export function useDebateTimeline(debateId: bigint | null) {
  const [timeline, setTimeline] = useState<DebateTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTimeline = useCallback(async () => {
    if (debateId === null) return;

    try {
      setLoading(true);
      const timelineData = await debateService.buildDebateTimeline(debateId);
      setTimeline(timelineData);
    } catch (err) {
      console.error('Error fetching debate timeline:', err);
    } finally {
      setLoading(false);
    }
  }, [debateId]);

  useEffect(() => {
    fetchTimeline();
    // Refresh every 15 seconds
    const interval = setInterval(fetchTimeline, 15000);
    return () => clearInterval(interval);
  }, [fetchTimeline]);

  return { timeline, loading, refetch: fetchTimeline };
}

/**
 * Hook to get agent debate statistics
 */
export function useAgentDebateStats(agentId: bigint | null) {
  const [stats, setStats] = useState<AgentDebateStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    if (agentId === null) return;

    try {
      setLoading(true);
      const statsData = await debateService.getAgentDebateStats(agentId);
      setStats(statsData);
    } catch (err) {
      console.error('Error fetching agent debate stats:', err);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, refetch: fetchStats };
}

/**
 * Hook to check if debate can be finalized
 */
export function useCanFinalizeDebate(debateId: bigint | null) {
  const [canFinalize, setCanFinalize] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkFinalize = useCallback(async () => {
    if (debateId === null) return;

    try {
      setLoading(true);
      const can = await debateService.canFinalize(debateId);
      setCanFinalize(can);
    } catch (err) {
      console.error('Error checking finalize status:', err);
    } finally {
      setLoading(false);
    }
  }, [debateId]);

  useEffect(() => {
    checkFinalize();
    // Refresh every 15 seconds
    const interval = setInterval(checkFinalize, 15000);
    return () => clearInterval(interval);
  }, [checkFinalize]);

  return { canFinalize, loading, refetch: checkFinalize };
}

/**
 * Hook to get active debate agents
 */
export function useActiveDebateAgents() {
  const [agentIds, setAgentIds] = useState<bigint[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAgents = useCallback(async () => {
    try {
      setLoading(true);
      const ids = await debateService.getActiveAgents();
      setAgentIds(ids);
    } catch (err) {
      console.error('Error fetching active debate agents:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  return {
    agentIds,
    agentCount: agentIds.length,
    loading,
    refetch: fetchAgents
  };
}

/**
 * Hook to get debate statistics
 */
export function useDebateStats() {
  const [stats, setStats] = useState({
    totalDebates: BigInt(0),
    nextDebateId: BigInt(1)
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const [totalDebates, nextDebateId] = await Promise.all([
        debateService.getTotalDebates(),
        debateService.getNextDebateId()
      ]);
      setStats({ totalDebates, nextDebateId });
    } catch (err) {
      console.error('Error fetching debate stats:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    // Refresh every minute
    const interval = setInterval(fetchStats, 60000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  return {
    ...stats,
    totalDebatesNumber: Number(stats.totalDebates),
    loading,
    refetch: fetchStats
  };
}

/**
 * Hook to get phase durations
 */
export function usePhaseDurations() {
  const [durations, setDurations] = useState({
    prediction: BigInt(600),
    evidence: BigInt(300),
    rebuttal: BigInt(300),
    dispute: BigInt(86400)
  });
  const [loading, setLoading] = useState(true);

  const fetchDurations = useCallback(async () => {
    try {
      setLoading(true);
      const durationData = await debateService.getPhaseDurations();
      setDurations(durationData);
    } catch (err) {
      console.error('Error fetching phase durations:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDurations();
  }, [fetchDurations]);

  const durationsFormatted = useMemo(() => ({
    prediction: `${Number(durations.prediction) / 60} min`,
    evidence: `${Number(durations.evidence) / 60} min`,
    rebuttal: `${Number(durations.rebuttal) / 60} min`,
    dispute: `${Number(durations.dispute) / 3600} hours`
  }), [durations]);

  return { durations, durationsFormatted, loading };
}

/**
 * Hook to file a dispute
 */
export function useFileDispute(debateId: bigint | null) {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const addresses = debateService.getAddresses();

  // Approve tokens for dispute stake
  const approveStake = useCallback(async (amount: string) => {
    const amountBigInt = parseEther(amount);

    writeContract({
      address: addresses.crownToken,
      abi: crownTokenAbi,
      functionName: 'approve',
      args: [addresses.debateOracle, amountBigInt]
    });
  }, [writeContract, addresses]);

  // File dispute with reasoning (stake is handled by contract's MIN_DISPUTE_STAKE)
  const fileDispute = useCallback(async (reasoning: string, _stakeAmount?: string) => {
    if (debateId === null) return;

    writeContract({
      address: addresses.debateOracle,
      abi: AIDebateOracleAbi,
      functionName: 'raiseDispute',
      args: [debateId, reasoning]
    });
  }, [debateId, writeContract, addresses]);

  return {
    approveStake,
    fileDispute,
    isPending,
    isConfirming,
    isSuccess,
    error,
    txHash: hash
  };
}

/**
 * Hook to get minimum dispute stake
 */
export function useMinDisputeStake() {
  const [minStake, setMinStake] = useState(parseEther('100'));
  const [loading, setLoading] = useState(true);

  const fetchMinStake = useCallback(async () => {
    try {
      setLoading(true);
      const stake = await debateService.getMinDisputeStake();
      setMinStake(stake);
    } catch (err) {
      console.error('Error fetching min dispute stake:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMinStake();
  }, [fetchMinStake]);

  return {
    minStake,
    minStakeFormatted: formatEther(minStake),
    loading
  };
}

/**
 * Hook for token balance and allowance for debate oracle
 */
export function useDebateTokenBalance() {
  const { address } = useAccount();
  const [balance, setBalance] = useState<bigint>(BigInt(0));
  const [allowance, setAllowance] = useState<bigint>(BigInt(0));
  const [loading, setLoading] = useState(true);

  const fetchBalanceAndAllowance = useCallback(async () => {
    if (!address) return;

    try {
      setLoading(true);
      const allow = await debateService.checkAllowance(address);
      setAllowance(allow);
      // Balance would come from token service
    } catch (err) {
      console.error('Error fetching allowance:', err);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchBalanceAndAllowance();
  }, [fetchBalanceAndAllowance]);

  return {
    balance,
    balanceFormatted: formatTokenAmount(balance),
    allowance,
    loading,
    refetch: fetchBalanceAndAllowance
  };
}

/**
 * Combined hook for full debate state
 */
export function useDebateFull(
  debateId: bigint | null,
  marketId: bigint | null,
  battleId: bigint | null
) {
  const { debate, loading: debateLoading, error } = useDebate(debateId, marketId, battleId);
  const { consensus, breakdown, confidencePercent, isConsensusReached } = useDebateConsensus(debateId);
  const { predictions, participantCount, yesCount, noCount } = useDebatePredictions(debateId);
  const { timeline } = useDebateTimeline(debateId);
  const { canFinalize } = useCanFinalizeDebate(debateId);

  return {
    debate,
    consensus,
    consensusBreakdown: breakdown,
    confidencePercent,
    isConsensusReached,
    predictions,
    participantCount,
    yesCount,
    noCount,
    timeline,
    canFinalize,
    loading: debateLoading,
    error
  };
}
