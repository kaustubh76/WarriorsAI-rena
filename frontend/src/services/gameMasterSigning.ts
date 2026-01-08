import { encodePacked, keccak256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export interface WarriorsTraitsData {
  tokenId: number; // uint16 in contract
  strength: number;
  wit: number;
  charisma: number;
  defence: number;
  luck: number;
  strike: string;
  taunt: string;
  dodge: string;
  special: string;
  recover: string;
}

export class GameMasterSigningService {
  private _gamemaster_private_key: `0x${string}` | null = null;

  // Lazy initialization of private key - only accessed when needed at runtime
  // NOTE: This service should only be used in server-side code (API routes)
  private get gamemaster_private_key(): `0x${string}` {
    if (!this._gamemaster_private_key) {
      // Server-side only - NEVER use NEXT_PUBLIC_ prefix for private keys
      const privateKey = process.env.GAME_MASTER_PRIVATE_KEY;
      if (!privateKey) {
        throw new Error('GAME_MASTER_PRIVATE_KEY not found in environment variables. Ensure this service is only used in server-side code.');
      }
      this._gamemaster_private_key = privateKey.startsWith('0x')
        ? privateKey as `0x${string}`
        : `0x${privateKey}` as `0x${string}`;
    }
    return this._gamemaster_private_key;
  }

  constructor() {
    // Empty constructor - private key is lazy-loaded to allow build-time success
  }

  /**
   * Signs the Warriors traits and moves data for contract verification
   * The signature order matches the contract's verification: tokenId, strength, wit, charisma, defence, luck, strike, taunt, dodge, special, recover
   */
  async signTraitsAndMoves(data: WarriorsTraitsData): Promise<`0x${string}`> {
    try {
      // Create the account from private key
      const account = privateKeyToAccount(this.gamemaster_private_key);

      // Encode the data in the same order as the contract expects (uint16 for tokenId and traits)
      const encodedData = encodePacked(
        ['uint16', 'uint16', 'uint16', 'uint16', 'uint16', 'uint16', 'string', 'string', 'string', 'string', 'string'],
        [
          data.tokenId,
          data.strength,
          data.wit,
          data.charisma,
          data.defence,
          data.luck,
          data.strike,
          data.taunt,
          data.dodge,
          data.special,
          data.recover
        ]
      );

      // Hash the encoded data
      const messageHash = keccak256(encodedData);

      // Sign the hash
      const signature = await account.signMessage({
        message: { raw: messageHash }
      });

      console.log('Game Master signed Warriors traits data:', {
        tokenId: data.tokenId.toString(),
        traits: {
          strength: data.strength,
          wit: data.wit,
          charisma: data.charisma,
          defence: data.defence,
          luck: data.luck
        },
        moves: {
          strike: data.strike,
          taunt: data.taunt,
          dodge: data.dodge,
          special: data.special,
          recover: data.recover
        },
        signature
      });

      return signature;
    } catch (error) {
      console.error('Error signing Warriors traits:', error);
      throw new Error(`Failed to sign Warriors traits: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extracts traits and moves from the AI response JSON
   * AI now returns format: {"Strength": 6211, "Wit": 8302, "strike_attack": "Tweet Storm", etc.}
   */
  extractTraitsAndMoves(aiResponse: Record<string, any>, tokenId: number): WarriorsTraitsData {
    try {
      // The AI response is now in a different format
      console.log('Extracting from AI response format:', aiResponse);

      return {
        tokenId,
        strength: aiResponse.Strength || aiResponse.strength || 0,
        wit: aiResponse.Wit || aiResponse.wit || 0,
        charisma: aiResponse.Charisma || aiResponse.charisma || 0,
        defence: aiResponse.Defence || aiResponse.defence || aiResponse.Defense || aiResponse.defense || 0, // Handle both spellings
        luck: aiResponse.Luck || aiResponse.luck || 0,
        strike: aiResponse.strike_attack || aiResponse.strike || 'Strike',
        taunt: aiResponse.taunt_attack || aiResponse.taunt || 'Taunt',
        dodge: aiResponse.dodge || 'Dodge',
        special: aiResponse.special_move || aiResponse.special || 'Special',
        recover: aiResponse.recover || 'Recover'
      };
    } catch (error) {
      console.error('Error extracting traits and moves:', error);
      throw new Error(`Failed to extract traits and moves: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the Game Master's public address for verification
   */
  getGameMasterAddress(): `0x${string}` {
    const account = privateKeyToAccount(this.gamemaster_private_key);
    return account.address;
  }
}

export const gameMasterSigningService = new GameMasterSigningService();
