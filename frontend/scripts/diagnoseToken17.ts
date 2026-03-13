/**
 * Diagnostic: Token ID 17 trait assignment revert
 * Run: cd frontend && npx tsx scripts/diagnoseToken17.ts
 */
import { createPublicClient, http, encodePacked, keccak256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { flowTestnet } from 'viem/chains';
import * as dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// Minimal ABI — only what we need
const abi = [
  { type: 'function', name: 'ownerOf', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'getTraits', inputs: [{ name: '_tokenId', type: 'uint256' }], outputs: [{ name: '', type: 'tuple', components: [{ name: 'strength', type: 'uint16' }, { name: 'wit', type: 'uint16' }, { name: 'charisma', type: 'uint16' }, { name: 'defence', type: 'uint16' }, { name: 'luck', type: 'uint16' }] }], stateMutability: 'view' },
  { type: 'function', name: 'getMoves', inputs: [{ name: '_tokenId', type: 'uint256' }], outputs: [{ name: '', type: 'tuple', components: [{ name: 'strike', type: 'string' }, { name: 'taunt', type: 'string' }, { name: 'dodge', type: 'string' }, { name: 'special', type: 'string' }, { name: 'recover', type: 'string' }] }], stateMutability: 'view' },
  { type: 'function', name: 'assignTraitsAndMoves', inputs: [{ name: '_tokenId', type: 'uint16' }, { name: '_strength', type: 'uint16' }, { name: '_wit', type: 'uint16' }, { name: '_charisma', type: 'uint16' }, { name: '_defence', type: 'uint16' }, { name: '_luck', type: 'uint16' }, { name: '_strike', type: 'string' }, { name: '_taunt', type: 'string' }, { name: '_dodge', type: 'string' }, { name: '_special', type: 'string' }, { name: '_recover', type: 'string' }, { name: '_signedData', type: 'bytes' }], outputs: [], stateMutability: 'nonpayable' },
  // errors
  { type: 'error', name: 'WarriorsNFT__TraitsAlreadyAssigned', inputs: [] },
  { type: 'error', name: 'WarriorsNFT__InvalidTokenId', inputs: [] },
  { type: 'error', name: 'WarriorsNFT__InvalidTraitsValue', inputs: [] },
  { type: 'error', name: 'WarriorsNFT__InvalidMovesNames', inputs: [] },
  { type: 'error', name: 'WarriorsNFT__InvalidSignature', inputs: [] },
  { type: 'error', name: 'ECDSAInvalidSignature', inputs: [] },
  { type: 'error', name: 'ERC721NonexistentToken', inputs: [{ name: 'tokenId', type: 'uint256' }] },
] as const;

const CONTRACT = '0x89f44bEefa27eC5199ddeB8fD16158d94296ED39' as const;
const TOKEN_ID = 1; // New contract starts at token 1

const client = createPublicClient({
  chain: flowTestnet,
  transport: http('https://testnet.evm.nodes.onflow.org', { timeout: 30000 }),
});

function printRevertDiagnosis(label: string, e: any) {
  console.log(`\n[${label}] REVERT ANALYSIS:`);
  // Print all available error properties
  if (e.shortMessage) console.log('  shortMessage:', e.shortMessage);
  if (e.metaMessages) console.log('  metaMessages:', e.metaMessages);
  if (e.details) console.log('  details:', e.details);
  if (e.cause) {
    console.log('  cause.shortMessage:', e.cause?.shortMessage);
    console.log('  cause.data:', e.cause?.data);
    console.log('  cause.signature:', e.cause?.signature);
    console.log('  cause.reason:', e.cause?.reason);
    if (e.cause?.cause) {
      console.log('  cause.cause.data:', e.cause.cause?.data);
      console.log('  cause.cause.code:', e.cause.cause?.code);
    }
  }
  // Check the full stringified error for known patterns
  const full = JSON.stringify(e, Object.getOwnPropertyNames(e), 2);
  const knownErrors = ['TraitsAlreadyAssigned', 'InvalidTokenId', 'InvalidTraitsValue', 'InvalidMovesNames', 'InvalidSignature', 'ECDSAInvalidSignature'];
  const matched = knownErrors.filter(err => full.includes(err));
  if (matched.length > 0) {
    console.log('  MATCHED ERROR(S):', matched.join(', '));
  } else {
    // Print raw error data to find the selector
    console.log('  NO KNOWN ERROR MATCHED. Full error (first 1500 chars):');
    console.log(full.slice(0, 1500));
  }
}

async function main() {
  console.log('=== TOKEN 17 DIAGNOSTIC ===\n');

  // 1. Does token 17 exist?
  console.log('--- 1. ownerOf(17) ---');
  try {
    const owner = await client.readContract({ address: CONTRACT, abi, functionName: 'ownerOf', args: [BigInt(TOKEN_ID)] });
    console.log(`Token ${TOKEN_ID} EXISTS — owner: ${owner}`);
  } catch (e: any) {
    console.log(`Token ${TOKEN_ID} DOES NOT EXIST — ${e.shortMessage || e.message}`);
    console.log('\nDiagnosis: Token was never minted. Nothing to fix in trait assignment.');
    return;
  }

  // 2. Current traits
  console.log('\n--- 2. getTraits(17) ---');
  const traits = await client.readContract({ address: CONTRACT, abi, functionName: 'getTraits', args: [BigInt(TOKEN_ID)] }) as any;
  console.log(`strength=${traits.strength} wit=${traits.wit} charisma=${traits.charisma} defence=${traits.defence} luck=${traits.luck}`);
  const traitsAssigned = traits.strength > 0 || traits.wit > 0 || traits.charisma > 0 || traits.defence > 0 || traits.luck > 0;
  console.log(traitsAssigned ? 'TRAITS ALREADY ASSIGNED' : 'TRAITS NOT YET ASSIGNED (all zero)');

  // 3. Current moves
  console.log('\n--- 3. getMoves(17) ---');
  const moves = await client.readContract({ address: CONTRACT, abi, functionName: 'getMoves', args: [BigInt(TOKEN_ID)] }) as any;
  console.log(`strike="${moves.strike}" taunt="${moves.taunt}" dodge="${moves.dodge}" special="${moves.special}" recover="${moves.recover}"`);

  // 4. Token counter probe
  console.log('\n--- 4. Token existence map (15-20) ---');
  for (const id of [15, 16, 17, 18, 19, 20]) {
    try {
      const owner = await client.readContract({ address: CONTRACT, abi, functionName: 'ownerOf', args: [BigInt(id)] });
      console.log(`  Token ${id}: EXISTS (owner: ${owner})`);
    } catch {
      console.log(`  Token ${id}: DOES NOT EXIST`);
    }
  }

  // 5. Simulate with dummy signature (known-good trait values)
  console.log('\n--- 5. simulateContract with DUMMY signature ---');
  const dummyKey = '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`;
  const dummyAccount = privateKeyToAccount(dummyKey);

  const testArgs = [TOKEN_ID, 7500, 6200, 5800, 4300, 8100, 'APY Chaser', 'Alpha Bet', 'Stablecoin Shield', 'Yield Cascade', 'VRF Strike'] as const;

  const encoded = encodePacked(
    ['uint16', 'uint16', 'uint16', 'uint16', 'uint16', 'uint16', 'string', 'string', 'string', 'string', 'string'],
    [...testArgs]
  );
  const hash = keccak256(encoded);
  const dummySig = await dummyAccount.signMessage({ message: { raw: hash } });

  try {
    await client.simulateContract({
      address: CONTRACT, abi, functionName: 'assignTraitsAndMoves',
      args: [...testArgs, dummySig],
      account: dummyAccount.address,
    });
    console.log('Simulation PASSED (unexpected with dummy sig)');
  } catch (e: any) {
    printRevertDiagnosis('DUMMY sig', e);
  }

  // 6. If GAME_MASTER_PRIVATE_KEY available, test with real signature
  const gmKey = process.env.GAME_MASTER_PRIVATE_KEY;
  if (!gmKey) {
    console.log('\n--- 6. GAME_MASTER_PRIVATE_KEY not set, skipping real sig test ---');
    return;
  }

  console.log('\n--- 6. simulateContract with REAL Game Master key ---');
  const formattedKey = (gmKey.startsWith('0x') ? gmKey : `0x${gmKey}`) as `0x${string}`;
  const gmAccount = privateKeyToAccount(formattedKey);
  console.log(`Game Master address: ${gmAccount.address}`);

  const realSig = await gmAccount.signMessage({ message: { raw: hash } });
  console.log(`Signature: ${realSig.slice(0, 20)}...${realSig.slice(-10)}`);

  try {
    await client.simulateContract({
      address: CONTRACT, abi, functionName: 'assignTraitsAndMoves',
      args: [...testArgs, realSig],
      account: gmAccount.address,
    });
    console.log('\nSimulation with REAL key PASSED!');
    console.log('→ assignTraitsAndMoves WOULD SUCCEED on-chain with these values.');
    console.log('→ The bug is in the frontend flow (trait generation or signing), not the contract.');
  } catch (e: any) {
    printRevertDiagnosis('REAL GM key', e);
  }

  // 7. Search for i_AiPublicKey embedded in contract bytecode (it's immutable)
  console.log('\n--- 7. Searching bytecode for i_AiPublicKey ---');
  const code = await client.getCode({ address: CONTRACT });
  if (code) {
    const codeHex = code.slice(2).toLowerCase();
    const gmAddrLower = gmAccount.address.slice(2).toLowerCase();

    if (codeHex.includes(gmAddrLower)) {
      console.log('GAME_MASTER address FOUND in bytecode — key matches contract');
    } else {
      console.log('GAME_MASTER address NOT in bytecode — WRONG KEY IN .env.local!');
      console.log(`Expected to find: ${gmAccount.address}`);

      // Find all PUSH20 embedded addresses
      const addresses = new Set<string>();
      for (let i = 0; i < codeHex.length - 42; i += 2) {
        if (codeHex.slice(i, i+2) === '73') { // PUSH20 opcode
          const addr = codeHex.slice(i+2, i+42);
          if (addr !== '0'.repeat(40)) addresses.add('0x' + addr);
        }
      }
      console.log('\nAll embedded addresses in bytecode (potential i_AiPublicKey):');
      for (const addr of addresses) {
        console.log(`  ${addr}`);
      }
    }
  }

  // 8. Check ALL private keys in .env to find which one matches i_AiPublicKey
  console.log('\n--- 8. Checking all .env private keys against bytecode addresses ---');
  const candidates = ['0x2d9fcbe2b7fa0cf6939250905b808210610d7257', '0x57a4501ddfe92f46681b20a084116128c5579160'];
  const keyNames = ['GAME_MASTER_PRIVATE_KEY', 'AI_SIGNER_PRIVATE_KEY', 'PRIVATE_KEY', 'FLOW_TESTNET_PRIVATE_KEY', 'SERVER_WALLET_PRIVATE_KEY'];

  for (const keyName of keyNames) {
    const raw = process.env[keyName];
    if (!raw) { console.log(`  ${keyName}: not set`); continue; }
    try {
      const fk = (raw.startsWith('0x') ? raw : `0x${raw}`) as `0x${string}`;
      const acct = privateKeyToAccount(fk);
      const matchesCandidate = candidates.some(c => c.toLowerCase() === acct.address.toLowerCase());
      console.log(`  ${keyName} → ${acct.address} ${matchesCandidate ? '✅ MATCHES BYTECODE' : ''}`);
    } catch (e: any) {
      console.log(`  ${keyName}: invalid key format`);
    }
  }

  // 9. Test with user-provided key
  console.log('\n--- 9. Testing with user-provided key ---');
  const userKey = '0xc6354f2a405a24b97b0afefd1374d1ba490f3db8944217f8d53387cc9fdecaa2' as `0x${string}`;
  const userAccount = privateKeyToAccount(userKey);
  console.log(`User key address: ${userAccount.address}`);

  const userSig = await userAccount.signMessage({ message: { raw: hash } });
  try {
    await client.simulateContract({
      address: CONTRACT, abi, functionName: 'assignTraitsAndMoves',
      args: [...testArgs, userSig],
      account: userAccount.address,
    });
    console.log('✅ Simulation with user key PASSED! This key IS the correct i_AiPublicKey.');
  } catch (e: any) {
    printRevertDiagnosis('USER key', e);
  }

  console.log('\n=== DONE ===');
}

main().catch(console.error);
