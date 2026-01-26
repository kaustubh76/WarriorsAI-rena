/**
 * Blockchain Formatting Utilities
 * Functions for formatting addresses, transactions, and blockchain data
 */

/**
 * Truncate an Ethereum address for display
 *
 * @example
 * truncateAddress('0x1234567890abcdef1234567890abcdef12345678')
 * // "0x1234...5678"
 *
 * truncateAddress('0x1234567890abcdef1234567890abcdef12345678', 6, 6)
 * // "0x123456...345678"
 */
export function truncateAddress(
  address: string,
  startChars: number = 4,
  endChars: number = 4
): string {
  if (!address) return '';

  // Handle ENS names or other non-hex addresses
  if (!address.startsWith('0x')) {
    if (address.length <= startChars + endChars + 3) {
      return address;
    }
    return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
  }

  // Standard hex address
  if (address.length <= startChars + endChars + 2) {
    return address;
  }

  return `${address.slice(0, startChars + 2)}...${address.slice(-endChars)}`;
}

/**
 * Truncate a transaction hash for display
 *
 * @example
 * truncateTxHash('0x1234567890abcdef...')
 * // "0x1234...cdef"
 */
export function truncateTxHash(
  hash: string,
  startChars: number = 6,
  endChars: number = 4
): string {
  return truncateAddress(hash, startChars, endChars);
}

/**
 * Format a token amount with symbol
 *
 * @example
 * formatTokenWithSymbol(1.5, 'ETH') // "1.5 ETH"
 * formatTokenWithSymbol(1000, 'USDC', 2) // "1,000.00 USDC"
 */
export function formatTokenWithSymbol(
  amount: number | string | bigint,
  symbol: string,
  decimals: number = 4
): string {
  const num = typeof amount === 'bigint' ? Number(amount) : Number(amount);

  if (isNaN(num)) return `0 ${symbol}`;

  const formatted = num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });

  return `${formatted} ${symbol}`;
}

/**
 * Format a gas price in Gwei
 *
 * @example
 * formatGasPrice(20000000000n) // "20 Gwei"
 */
export function formatGasPrice(wei: bigint | string | number): string {
  const weiBigInt = typeof wei === 'bigint' ? wei : BigInt(wei);
  const gwei = Number(weiBigInt) / 1e9;

  if (gwei < 0.01) {
    return '< 0.01 Gwei';
  }

  return `${gwei.toFixed(2)} Gwei`;
}

/**
 * Format a block number
 *
 * @example
 * formatBlockNumber(19000000) // "#19,000,000"
 */
export function formatBlockNumber(blockNumber: number | bigint | string): string {
  const num = typeof blockNumber === 'bigint' ? Number(blockNumber) : Number(blockNumber);
  return `#${num.toLocaleString()}`;
}

/**
 * Generate a block explorer URL for an address
 *
 * @example
 * getExplorerUrl('0x...', 'address', 'ethereum')
 * // "https://etherscan.io/address/0x..."
 */
export function getExplorerUrl(
  value: string,
  type: 'address' | 'tx' | 'block' | 'token' = 'address',
  chain: 'ethereum' | 'flow' | 'flow-testnet' | '0g' | '0g-testnet' = 'ethereum'
): string {
  const explorers: Record<string, { base: string; paths: Record<string, string> }> = {
    ethereum: {
      base: 'https://etherscan.io',
      paths: { address: 'address', tx: 'tx', block: 'block', token: 'token' },
    },
    flow: {
      base: 'https://evm.flowscan.io',
      paths: { address: 'address', tx: 'tx', block: 'block', token: 'token' },
    },
    'flow-testnet': {
      base: 'https://evm-testnet.flowscan.io',
      paths: { address: 'address', tx: 'tx', block: 'block', token: 'token' },
    },
    '0g': {
      base: 'https://chainscan.0g.ai',
      paths: { address: 'address', tx: 'tx', block: 'block', token: 'token' },
    },
    '0g-testnet': {
      base: 'https://chainscan-galileo.0g.ai',
      paths: { address: 'address', tx: 'tx', block: 'block', token: 'token' },
    },
  };

  const explorer = explorers[chain] || explorers.ethereum;
  const path = explorer.paths[type] || 'address';

  return `${explorer.base}/${path}/${value}`;
}

/**
 * Check if a string is a valid Ethereum address
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Check if a string is a valid transaction hash
 */
export function isValidTxHash(hash: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}

/**
 * Normalize an Ethereum address (checksum)
 * Note: This is a simple lowercase normalization.
 * For full EIP-55 checksum, use viem's getAddress()
 */
export function normalizeAddress(address: string): string {
  if (!address) return '';
  return address.toLowerCase();
}

/**
 * Compare two addresses (case-insensitive)
 */
export function addressesEqual(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Format a chain ID to chain name
 */
export function getChainName(chainId: number): string {
  const chains: Record<number, string> = {
    1: 'Ethereum',
    5: 'Goerli',
    11155111: 'Sepolia',
    137: 'Polygon',
    80001: 'Mumbai',
    42161: 'Arbitrum',
    10: 'Optimism',
    545: 'Flow Testnet',
    747: 'Flow Mainnet',
    16600: '0G Mainnet',
    16602: '0G Galileo Testnet',
  };

  return chains[chainId] || `Chain ${chainId}`;
}

/**
 * Get the native currency symbol for a chain
 */
export function getNativeCurrency(chainId: number): string {
  const currencies: Record<number, string> = {
    1: 'ETH',
    5: 'ETH',
    11155111: 'ETH',
    137: 'MATIC',
    80001: 'MATIC',
    42161: 'ETH',
    10: 'ETH',
    545: 'FLOW',
    747: 'FLOW',
    16600: '0G',
    16602: '0G',
  };

  return currencies[chainId] || 'ETH';
}

/**
 * Format wei to ether
 *
 * @example
 * formatWei(1000000000000000000n) // "1.0"
 */
export function formatWei(
  wei: bigint | string | number,
  decimals: number = 4
): string {
  const weiBigInt = typeof wei === 'bigint' ? wei : BigInt(wei);
  const ether = Number(weiBigInt) / 1e18;
  return ether.toFixed(decimals);
}

/**
 * Parse ether to wei
 *
 * @example
 * parseEther("1.5") // 1500000000000000000n
 */
export function parseEther(ether: string | number): bigint {
  const num = typeof ether === 'string' ? parseFloat(ether) : ether;
  return BigInt(Math.round(num * 1e18));
}

/**
 * Format a signature for display
 *
 * @example
 * truncateSignature('0x1234...long signature...abcd')
 * // "0x1234...abcd"
 */
export function truncateSignature(
  signature: string,
  startChars: number = 10,
  endChars: number = 8
): string {
  if (!signature || signature.length <= startChars + endChars + 3) {
    return signature || '';
  }
  return `${signature.slice(0, startChars)}...${signature.slice(-endChars)}`;
}
