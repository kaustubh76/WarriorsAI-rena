/**
 * Verify new WarriorsNFT contract has correct i_AiPublicKey
 * Run: cd frontend && npx tsx scripts/verifyNewContract.ts
 */
import { createPublicClient, http, encodePacked, keccak256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { flowTestnet } from 'viem/chains';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const abi = [
  { type: 'function', name: 'ownerOf', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'mintNft', inputs: [{ name: 'encryptedURI', type: 'string' }, { name: 'metadataHash', type: 'bytes32' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'getTraits', inputs: [{ name: '_tokenId', type: 'uint256' }], outputs: [{ name: '', type: 'tuple', components: [{ name: 'strength', type: 'uint16' }, { name: 'wit', type: 'uint16' }, { name: 'charisma', type: 'uint16' }, { name: 'defence', type: 'uint16' }, { name: 'luck', type: 'uint16' }] }], stateMutability: 'view' },
  { type: 'function', name: 'assignTraitsAndMoves', inputs: [{ name: '_tokenId', type: 'uint16' }, { name: '_strength', type: 'uint16' }, { name: '_wit', type: 'uint16' }, { name: '_charisma', type: 'uint16' }, { name: '_defence', type: 'uint16' }, { name: '_luck', type: 'uint16' }, { name: '_strike', type: 'string' }, { name: '_taunt', type: 'string' }, { name: '_dodge', type: 'string' }, { name: '_special', type: 'string' }, { name: '_recover', type: 'string' }, { name: '_signedData', type: 'bytes' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'error', name: 'WarriorsNFT__InvalidSignature', inputs: [] },
  { type: 'error', name: 'WarriorsNFT__InvalidTokenId', inputs: [] },
  { type: 'error', name: 'WarriorsNFT__TraitsAlreadyAssigned', inputs: [] },
  { type: 'error', name: 'WarriorsNFT__InvalidTraitsValue', inputs: [] },
] as const;

const NEW_CONTRACT = '0x89f44bEefa27eC5199ddeB8fD16158d94296ED39' as const;

const client = createPublicClient({
  chain: flowTestnet,
  transport: http('https://testnet.evm.nodes.onflow.org', { timeout: 30000 }),
});

async function main() {
  console.log('=== VERIFY NEW WARRIORSNFT CONTRACT ===\n');

  // 1. Check GM key matches
  const gmKey = process.env.GAME_MASTER_PRIVATE_KEY;
  if (!gmKey) { console.log('ERROR: GAME_MASTER_PRIVATE_KEY not set'); return; }
  const fk = (gmKey.startsWith('0x') ? gmKey : `0x${gmKey}`) as `0x${string}`;
  const gmAccount = privateKeyToAccount(fk);
  console.log('Game Master address:', gmAccount.address);

  // 2. Check bytecode for GM address
  const code = await client.getCode({ address: NEW_CONTRACT });
  if (!code) { console.log('ERROR: No code at new contract address'); return; }
  const found = code.toLowerCase().includes(gmAccount.address.slice(2).toLowerCase());
  console.log(`GM address in bytecode: ${found ? '✅ YES' : '❌ NO'}`);

  if (!found) {
    console.log('FATAL: Contract was not deployed with this GM address');
    return;
  }

  // 3. Mint a test NFT so we can test trait assignment
  console.log('\n--- Minting test NFT (token 1) ---');
  const { createWalletClient } = await import('viem');
  const walletClient = createWalletClient({
    chain: flowTestnet,
    transport: http('https://testnet.evm.nodes.onflow.org', { timeout: 60000 }),
    account: privateKeyToAccount(fk),
  });

  try {
    const mintHash = await walletClient.writeContract({
      address: NEW_CONTRACT,
      abi,
      functionName: 'mintNft',
      args: ['test-metadata-hash-for-verification', '0x' + '00'.repeat(32) as `0x${string}`],
    });
    console.log('Mint tx:', mintHash);
    const receipt = await client.waitForTransactionReceipt({ hash: mintHash, timeout: 60000 });
    console.log('Mint status:', receipt.status);
  } catch (e: any) {
    console.log('Mint error:', e.shortMessage || e.message);
    // Check if token 1 already exists
    try {
      const owner = await client.readContract({ address: NEW_CONTRACT, abi, functionName: 'ownerOf', args: [1n] });
      console.log('Token 1 already exists, owner:', owner);
    } catch {
      console.log('Token 1 does not exist and mint failed');
      return;
    }
  }

  // 4. Sign traits and simulate assignTraitsAndMoves
  console.log('\n--- Testing assignTraitsAndMoves with real GM key ---');
  const tokenId = 1;
  const testArgs = [tokenId, 7500, 6200, 5800, 4300, 8100, 'APY Chaser', 'Alpha Bet', 'Stablecoin Shield', 'Yield Cascade', 'VRF Strike'] as const;

  const encoded = encodePacked(
    ['uint16', 'uint16', 'uint16', 'uint16', 'uint16', 'uint16', 'string', 'string', 'string', 'string', 'string'],
    [...testArgs]
  );
  const hash = keccak256(encoded);
  const sig = await gmAccount.signMessage({ message: { raw: hash } });

  try {
    await client.simulateContract({
      address: NEW_CONTRACT, abi, functionName: 'assignTraitsAndMoves',
      args: [...testArgs, sig],
      account: gmAccount.address,
    });
    console.log('✅ simulateContract PASSED! Signature is valid.');
  } catch (e: any) {
    const msg = e.shortMessage || e.message;
    console.log('Simulate failed:', msg);
    if (msg.includes('InvalidSignature')) console.log('❌ STILL InvalidSignature — key mismatch persists');
    else console.log('Error:', msg.slice(0, 300));
    return;
  }

  // 5. Actually send the assignTraitsAndMoves tx
  console.log('\n--- Sending assignTraitsAndMoves tx ---');
  try {
    const txHash = await walletClient.writeContract({
      address: NEW_CONTRACT, abi, functionName: 'assignTraitsAndMoves',
      args: [...testArgs, sig],
    });
    console.log('Tx hash:', txHash);
    const receipt = await client.waitForTransactionReceipt({ hash: txHash, timeout: 60000 });
    console.log('Tx status:', receipt.status);

    if (receipt.status === 'success') {
      // 6. Verify traits on-chain
      const traits = await client.readContract({ address: NEW_CONTRACT, abi, functionName: 'getTraits', args: [1n] }) as any;
      console.log('\n✅ TRAITS SUCCESSFULLY ASSIGNED ON-CHAIN:');
      console.log(`  strength=${traits.strength} wit=${traits.wit} charisma=${traits.charisma} defence=${traits.defence} luck=${traits.luck}`);
      console.log('\n🎉 Contract is working correctly! Ready for production use.');
    }
  } catch (e: any) {
    console.log('Tx failed:', e.shortMessage || e.message);
  }

  console.log('\n=== DONE ===');
}

main().catch(console.error);
