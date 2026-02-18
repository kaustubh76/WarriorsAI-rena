# Private Key Security Documentation

## Overview

This document describes the private keys used in the WarriorsAI-rena project, their purposes, and security recommendations.

## Private Keys in Use

### 1. PRIVATE_KEY
**Purpose**: General execution key for 0G Network operations and storage
**Used In**:
- `/app/api/0g/store/route.ts` - Uploading metadata to 0G Storage
- `/app/api/0g/upload/route.ts` - File uploads to 0G
- `/app/api/0g/health/route.ts` - Health check operations
- `/app/api/0g/inference/route.ts` - AI inference requests
- `/app/api/0g/deposit/route.ts` - Deposit operations
- `/app/api/flow/execute/route.ts` - Flow chain transactions
- `/app/api/flow/vrf-trade/route.ts` - VRF-based trading
- `/app/api/agents/external-trade/route.ts` - External trading
- `/lib/zeroGProvider.ts` - 0G provider initialization
- `/services/crossChainService.ts` - Cross-chain operations

**Risk Level**: HIGH - Direct access to funds and contract execution

### 2. GAME_MASTER_PRIVATE_KEY
**Purpose**: Battle resolution and trait signing for the arena game
**Used In**:
- `/app/api/game-master/route.ts` - Game master decisions
- `/app/api/sign-traits/route.ts` - Signing NFT traits
- `/services/gameMasterSigning.ts` - Signature generation
- `/services/arenaBackendService.ts` - Arena backend operations
- `/app/api/arena/automation/[battleId]/route.ts` - Battle execution

**Risk Level**: HIGH - Controls game outcomes and NFT traits

### 3. ORACLE_SIGNER_PRIVATE_KEY
**Purpose**: Oracle resolution for prediction markets
**Used In**:
- `/app/api/oracle/resolve/route.ts` - Resolving market outcomes

**Risk Level**: HIGH - Controls market settlements

### 4. AI_SIGNER_PRIVATE_KEY
**Purpose**: AI agent trade execution
**Used In**:
- `/pages/api/generate-battle-moves.ts` - Battle move generation
- `/app/api/markets/settle/route.ts` - Market settlement
- `/config/index.ts` - Configuration reference

**Risk Level**: MEDIUM - Limited to AI agent operations

### 5. ORACLE_PRIVATE_KEY (fallback)
**Purpose**: Fallback oracle key
**Used In**:
- `/services/crossChainService.ts` - Cross-chain oracle operations
- `/app/api/agents/external-trade/route.ts` - Fallback for trades

**Risk Level**: HIGH - Same capabilities as main PRIVATE_KEY

## Security Recommendations

### Immediate Actions

1. **Audit Key Access**: Review which keys are absolutely necessary for each operation
2. **Principle of Least Privilege**: Ensure each key only has permissions for its specific purpose
3. **Key Separation**: Consider using HD wallet derivation to generate operation-specific keys from a master seed

### Short-term Improvements

1. **Environment Validation**: Use `validateEnv.ts` to ensure keys are present at startup
2. **Key Rotation Procedures**: Document and implement key rotation process
3. **Access Logging**: Log all operations that use private keys (without logging the keys themselves)

### Long-term Security

1. **Key Vault Integration**: Migrate to AWS KMS, HashiCorp Vault, or similar
2. **Hardware Security Modules (HSM)**: Consider HSM for production deployments
3. **Multi-sig Requirements**: Implement multi-sig for high-value operations
4. **Tiered Key System**:
   - Hot keys: Limited balance, frequent operations
   - Warm keys: Moderate balance, periodic operations
   - Cold keys: Large balance, rare operations (manual approval)

## Key Derivation Recommendation

Instead of multiple separate keys, consider using HD wallet derivation:

```typescript
// Example HD derivation paths
const DERIVATION_PATHS = {
  storage: "m/44'/60'/0'/0/0",      // 0G storage operations
  gameMaster: "m/44'/60'/0'/0/1",   // Game master signing
  oracle: "m/44'/60'/0'/0/2",       // Oracle resolution
  aiAgent: "m/44'/60'/0'/0/3",      // AI agent operations
};
```

This allows:
- Single master seed to backup
- Easy key rotation by changing master seed
- Clear audit trail of which key performed which operation

## Environment Variables Checklist

Required in production:
- [ ] `PRIVATE_KEY` - Must be set
- [ ] `GAME_MASTER_PRIVATE_KEY` - Must be set for arena operations
- [ ] `ORACLE_SIGNER_PRIVATE_KEY` - Must be set for market resolution

Optional:
- [ ] `AI_SIGNER_PRIVATE_KEY` - Set if using AI agent features
- [ ] `ORACLE_PRIVATE_KEY` - Fallback, may not be needed

## Incident Response

If a key is compromised:

1. **Immediately**: Revoke key access in contracts (if supported)
2. **Within 1 hour**: Transfer funds to secure address
3. **Within 24 hours**: Generate new keys and update environment
4. **Within 1 week**: Audit all transactions from compromised key

## Contact

For security concerns, contact the development team directly.

---

*Last Updated: 2024*
*Document Version: 1.0*
