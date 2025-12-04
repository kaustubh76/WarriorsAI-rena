import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// BLOCKCHAIN SERVICE
// ============================================================================

// ABI snippets for the contracts we need to interact with
const ARENA_ABI = [
  'event GameFinished(uint256 indexed gameId, uint256 winner, uint256 warrior1Damage, uint256 warrior2Damage)',
  'event GameInitialized(uint256 indexed gameId, uint256 warrior1, uint256 warrior2)',
  'function currentGame() view returns (uint256)',
  'function getGameInfo(uint256 gameId) view returns (tuple(uint256 warrior1, uint256 warrior2, uint256 warrior1Damage, uint256 warrior2Damage, uint8 status, uint256 prizePool))',
];

const WARRIORS_NFT_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  'event TraitsAssigned(uint256 indexed tokenId, uint256 strength, uint256 wit, uint256 charisma, uint256 defence, uint256 luck)',
  'event Promotion(uint256 indexed tokenId, uint8 oldRank, uint8 newRank)',
  'function totalSupply() view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function getTraits(uint256 tokenId) view returns (tuple(uint256 strength, uint256 wit, uint256 charisma, uint256 defence, uint256 luck))',
  'function getRank(uint256 tokenId) view returns (uint8)',
  'function getWinnings(uint256 tokenId) view returns (uint256)',
];

const CROWN_TOKEN_ABI = [
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
];

// ============================================================================
// TYPES
// ============================================================================

interface Warrior {
  id: number;
  name: string;
  owner: string;
  traits: {
    strength: number;
    wit: number;
    charisma: number;
    defence: number;
    luck: number;
  };
  rank: string;
  wins: number;
  losses: number;
  totalWinnings: number;
}

interface Battle {
  id: string;
  warrior1Id: number;
  warrior2Id: number;
  warrior1Damage: number;
  warrior2Damage: number;
  warrior1Moves: number[];
  warrior2Moves: number[];
  prizePool: number;
  winner: number;
  timestamp: number;
}

interface ArenaStats {
  totalBattles: number;
  totalWarriors: number;
  uniquePlayers: number;
  totalVolume: number;
  battlesToday: number;
  activeTournaments: number;
}

interface DailyStats {
  battles: number;
  newWarriors: number;
  volume: number;
  topWarrior: { id: number; wins: number };
  biggestWin: number;
}

// ============================================================================
// BLOCKCHAIN SERVICE CLASS
// ============================================================================

class BlockchainService {
  private provider: ethers.JsonRpcProvider;
  private arenaContract: ethers.Contract;
  private warriorsContract: ethers.Contract;
  private crownContract: ethers.Contract;

  // Event callbacks
  private battleCallbacks: ((battle: Battle) => void)[] = [];
  private mintCallbacks: ((warrior: any) => void)[] = [];
  private promotionCallbacks: ((promotion: any) => void)[] = [];

  // Cache
  private statsCache: { data: ArenaStats | null; timestamp: number } = {
    data: null,
    timestamp: 0,
  };

  constructor() {
    this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

    this.arenaContract = new ethers.Contract(
      process.env.ARENA_CONTRACT_ADDRESS!,
      ARENA_ABI,
      this.provider
    );

    this.warriorsContract = new ethers.Contract(
      process.env.WARRIORS_NFT_ADDRESS!,
      WARRIORS_NFT_ABI,
      this.provider
    );

    this.crownContract = new ethers.Contract(
      process.env.CROWN_TOKEN_ADDRESS!,
      CROWN_TOKEN_ABI,
      this.provider
    );

    this.setupEventListeners();
  }

  // --------------------------------------------------------------------------
  // EVENT LISTENERS
  // --------------------------------------------------------------------------

  private setupEventListeners(): void {
    // Listen for battle completion
    this.arenaContract.on('GameFinished', async (gameId, winner, w1Damage, w2Damage) => {
      console.log(`Battle ${gameId} finished! Winner: ${winner}`);

      const battle = await this.getBattle(gameId.toString());
      this.battleCallbacks.forEach((cb) => cb(battle));
    });

    // Listen for new warriors minted
    this.warriorsContract.on('Transfer', async (from, to, tokenId) => {
      // Check if it's a mint (from zero address)
      if (from === ethers.ZeroAddress) {
        console.log(`New warrior minted: #${tokenId}`);

        const warrior = await this.getWarrior(Number(tokenId));
        this.mintCallbacks.forEach((cb) => cb(warrior));
      }
    });

    // Listen for rank promotions
    this.warriorsContract.on('Promotion', async (tokenId, oldRank, newRank) => {
      console.log(`Warrior #${tokenId} promoted from ${oldRank} to ${newRank}`);

      const ranks = ['UNRANKED', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];
      const promotion = {
        warriorId: Number(tokenId),
        oldRank: ranks[oldRank],
        newRank: ranks[newRank],
        totalWinnings: await this.getWarriorWinnings(Number(tokenId)),
      };

      this.promotionCallbacks.forEach((cb) => cb(promotion));
    });
  }

  // Callback registration
  onBattleComplete(callback: (battle: Battle) => void): void {
    this.battleCallbacks.push(callback);
  }

  onWarriorMinted(callback: (warrior: any) => void): void {
    this.mintCallbacks.push(callback);
  }

  onRankPromotion(callback: (promotion: any) => void): void {
    this.promotionCallbacks.push(callback);
  }

  // --------------------------------------------------------------------------
  // WARRIOR DATA
  // --------------------------------------------------------------------------

  async getWarrior(tokenId: number): Promise<Warrior> {
    const [owner, traits, rank, winnings] = await Promise.all([
      this.warriorsContract.ownerOf(tokenId),
      this.warriorsContract.getTraits(tokenId),
      this.warriorsContract.getRank(tokenId),
      this.warriorsContract.getWinnings(tokenId),
    ]);

    const ranks = ['UNRANKED', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];

    return {
      id: tokenId,
      name: `Warrior #${tokenId}`,
      owner,
      traits: {
        strength: Number(traits.strength),
        wit: Number(traits.wit),
        charisma: Number(traits.charisma),
        defence: Number(traits.defence),
        luck: Number(traits.luck),
      },
      rank: ranks[rank] || 'UNRANKED',
      wins: 0, // Would need to track separately or add to contract
      losses: 0,
      totalWinnings: Number(ethers.formatEther(winnings)),
    };
  }

  async getWarriorWinnings(tokenId: number): Promise<number> {
    const winnings = await this.warriorsContract.getWinnings(tokenId);
    return Number(ethers.formatEther(winnings));
  }

  // --------------------------------------------------------------------------
  // BATTLE DATA
  // --------------------------------------------------------------------------

  async getBattle(gameId: string): Promise<Battle> {
    const gameInfo = await this.arenaContract.getGameInfo(gameId);

    // In a real implementation, you'd fetch move history from events or storage
    const mockMoves = [0, 1, 2, 3, 4]; // Placeholder

    return {
      id: gameId,
      warrior1Id: Number(gameInfo.warrior1),
      warrior2Id: Number(gameInfo.warrior2),
      warrior1Damage: Number(gameInfo.warrior1Damage),
      warrior2Damage: Number(gameInfo.warrior2Damage),
      warrior1Moves: mockMoves,
      warrior2Moves: mockMoves,
      prizePool: Number(ethers.formatEther(gameInfo.prizePool)),
      winner:
        Number(gameInfo.warrior1Damage) < Number(gameInfo.warrior2Damage)
          ? Number(gameInfo.warrior1)
          : Number(gameInfo.warrior2),
      timestamp: Date.now(),
    };
  }

  async getLatestBattle(): Promise<Battle> {
    const currentGame = await this.arenaContract.currentGame();
    return this.getBattle(currentGame.toString());
  }

  // --------------------------------------------------------------------------
  // STATISTICS
  // --------------------------------------------------------------------------

  async getArenaStats(): Promise<ArenaStats> {
    // Return cached data if fresh (less than 5 minutes old)
    if (this.statsCache.data && Date.now() - this.statsCache.timestamp < 300000) {
      return this.statsCache.data;
    }

    const [totalWarriors, currentGame] = await Promise.all([
      this.warriorsContract.totalSupply(),
      this.arenaContract.currentGame(),
    ]);

    const stats: ArenaStats = {
      totalBattles: Number(currentGame),
      totalWarriors: Number(totalWarriors),
      uniquePlayers: Math.floor(Number(totalWarriors) * 0.7), // Estimate
      totalVolume: Number(currentGame) * 100, // Rough estimate
      battlesToday: Math.floor(Math.random() * 50) + 10, // Would need event indexing
      activeTournaments: 1, // Would need tournament contract
    };

    this.statsCache = { data: stats, timestamp: Date.now() };
    return stats;
  }

  async getDailyStats(): Promise<DailyStats> {
    // In production, this would query indexed events
    const stats = await this.getArenaStats();

    return {
      battles: stats.battlesToday,
      newWarriors: Math.floor(Math.random() * 20) + 5,
      volume: stats.battlesToday * 100,
      topWarrior: { id: 1, wins: 10 },
      biggestWin: 500,
    };
  }

  async getWeeklyStats(): Promise<any> {
    const daily = await this.getDailyStats();

    return {
      battles: daily.battles * 7,
      newWarriors: daily.newWarriors * 7,
      volume: daily.volume * 7,
      topWarrior: daily.topWarrior,
    };
  }

  // --------------------------------------------------------------------------
  // LEADERBOARD
  // --------------------------------------------------------------------------

  async getLeaderboard(
    type: string,
    limit: number
  ): Promise<{ id: number; value: number }[]> {
    // In production, this would query an indexed database
    // For now, return mock data
    const leaderboard = [];

    for (let i = 1; i <= limit; i++) {
      leaderboard.push({
        id: i,
        value: Math.floor(Math.random() * 100) + (limit - i) * 10,
      });
    }

    return leaderboard.sort((a, b) => b.value - a.value);
  }

  // --------------------------------------------------------------------------
  // TOURNAMENTS
  // --------------------------------------------------------------------------

  async getActiveTournaments(): Promise<any[]> {
    // Would need tournament contract integration
    return [
      {
        id: '1',
        name: 'Weekly Arena Clash',
        prizePool: 1000,
        participants: 24,
        maxParticipants: 32,
        startTime: Date.now() + 86400000, // Tomorrow
        entryFee: 50,
      },
    ];
  }
}

export { BlockchainService, Warrior, Battle, ArenaStats, DailyStats };
