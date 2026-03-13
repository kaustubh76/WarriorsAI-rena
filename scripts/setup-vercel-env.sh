#!/bin/bash

# ============================================================================
# Vercel Environment Variables Setup Script
# ============================================================================
# This script helps you configure all required environment variables in Vercel
# Run: ./scripts/setup-vercel-env.sh
# ============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🔧 Vercel Environment Variables Setup${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo -e "${RED}❌ Vercel CLI not found${NC}"
    echo ""
    echo "Install with: npm install -g vercel"
    exit 1
fi

echo -e "${GREEN}✓${NC} Vercel CLI found"
echo ""

# Navigate to frontend directory
cd "$(dirname "$0")/../frontend" || exit 1

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ .env file not found${NC}"
    echo "Please create a .env file in the frontend directory"
    exit 1
fi

echo -e "${YELLOW}📋 This script will add environment variables to Vercel${NC}"
echo -e "${YELLOW}   Environment: production${NC}"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT:${NC}"
echo -e "   - DO NOT use test/development keys in production"
echo -e "   - Generate new keys for production deployment"
echo -e "   - Keep private keys secure"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}📦 Flow Blockchain Configuration${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Flow RPC URLs
echo "Setting NEXT_PUBLIC_FLOW_TESTNET_RPC..."
echo "https://testnet.evm.nodes.onflow.org" | vercel env add NEXT_PUBLIC_FLOW_TESTNET_RPC production --force

echo "Setting NEXT_PUBLIC_CHAIN_ID..."
echo "545" | vercel env add NEXT_PUBLIC_CHAIN_ID production --force

echo "Setting NEXT_PUBLIC_FLOW_FALLBACK_RPC..."
echo "https://flow-testnet.gateway.tatum.io" | vercel env add NEXT_PUBLIC_FLOW_FALLBACK_RPC production --force

echo ""
echo -e "${GREEN}✓ Flow blockchain configuration added${NC}"
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}📝 Smart Contract Addresses${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo "Setting EXTERNAL_MARKET_MIRROR_ADDRESS..."
echo "0x7485019de6Eca5665057bAe08229F9E660ADEfDa" | vercel env add EXTERNAL_MARKET_MIRROR_ADDRESS production --force

echo "Setting NEXT_PUBLIC_CRWN_TOKEN_ADDRESS..."
echo "0x9Fd6CCEE1243EaC173490323Ed6B8b8E0c15e8e6" | vercel env add NEXT_PUBLIC_CRWN_TOKEN_ADDRESS production --force

echo "Setting NEXT_PUBLIC_PREDICTION_MARKET_AMM_ADDRESS..."
echo "0x1b26203A2752557ecD4763a9A8A26119AC5e18e4" | vercel env add NEXT_PUBLIC_PREDICTION_MARKET_AMM_ADDRESS production --force

echo "Setting NEXT_PUBLIC_WARRIORS_NFT_ADDRESS..."
echo "0x89f44bEefa27eC5199ddeB8fD16158d94296ED39" | vercel env add NEXT_PUBLIC_WARRIORS_NFT_ADDRESS production --force

echo "Setting NEXT_PUBLIC_ARENA_FACTORY_ADDRESS..."
echo "0xf77840febD42325F83cB93F9deaE0F8b14Eececf" | vercel env add NEXT_PUBLIC_ARENA_FACTORY_ADDRESS production --force

echo "Setting NEXT_PUBLIC_FLOW_VRF_ORACLE_ADDRESS..."
echo "0xd81373eEd88FacE56c21CFA4787c80C325e0bC6E" | vercel env add NEXT_PUBLIC_FLOW_VRF_ORACLE_ADDRESS production --force

echo ""
echo -e "${GREEN}✓ Contract addresses added${NC}"
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🔐 0G Network Configuration${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo "Setting NEXT_PUBLIC_0G_COMPUTE_RPC..."
echo "https://evmrpc-testnet.0g.ai" | vercel env add NEXT_PUBLIC_0G_COMPUTE_RPC production --force

echo "Setting NEXT_PUBLIC_0G_CHAIN_ID..."
echo "16602" | vercel env add NEXT_PUBLIC_0G_CHAIN_ID production --force

echo "Setting NEXT_PUBLIC_0G_STORAGE_INDEXER..."
echo "https://indexer-storage-testnet-turbo.0g.ai" | vercel env add NEXT_PUBLIC_0G_STORAGE_INDEXER production --force

echo "Setting NEXT_PUBLIC_USE_0G_COMPUTE..."
echo "true" | vercel env add NEXT_PUBLIC_USE_0G_COMPUTE production --force

echo ""
echo -e "${GREEN}✓ 0G network configuration added${NC}"
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🌐 WalletConnect Configuration${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo "Setting NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID..."
echo "70324e2b10f46c36029a6e5b927db0db" | vercel env add NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID production --force

echo ""
echo -e "${GREEN}✓ WalletConnect configuration added${NC}"
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}⚠️  MANUAL CONFIGURATION REQUIRED${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "The following variables MUST be configured manually:"
echo ""
echo -e "${RED}1. PRIVATE_KEY${NC}"
echo "   Description: Private key for 0G compute operations"
echo "   ⚠️  Generate a NEW key for production (DO NOT use dev key)"
echo "   Add with: vercel env add PRIVATE_KEY production"
echo ""
echo -e "${RED}2. ORACLE_PRIVATE_KEY${NC}"
echo "   Description: Private key for oracle operations"
echo "   ⚠️  Generate a NEW key for production (DO NOT use dev key)"
echo "   Add with: vercel env add ORACLE_PRIVATE_KEY production"
echo ""
echo -e "${RED}3. AI_SIGNER_PRIVATE_KEY${NC}"
echo "   Description: Private key for AI signing"
echo "   ⚠️  Generate a NEW key for production (DO NOT use dev key)"
echo "   Add with: vercel env add AI_SIGNER_PRIVATE_KEY production"
echo ""
echo -e "${RED}4. GAME_MASTER_PRIVATE_KEY${NC}"
echo "   Description: Private key for game master operations"
echo "   ⚠️  Generate a NEW key for production (DO NOT use dev key)"
echo "   Add with: vercel env add GAME_MASTER_PRIVATE_KEY production"
echo ""
echo -e "${RED}5. DATABASE_URL${NC}"
echo "   Description: PostgreSQL connection string"
echo "   Options:"
echo "   - Vercel Postgres: vercel postgres create"
echo "   - External: Use Supabase, Neon, Railway, etc."
echo "   Format: postgresql://user:password@host:5432/db?sslmode=require"
echo "   Add with: vercel env add DATABASE_URL production"
echo ""
echo -e "${RED}6. NEXT_PUBLIC_STORAGE_API_URL${NC}"
echo "   Description: URL of your deployed 0G storage service"
echo "   ⚠️  0G storage must be deployed separately (cannot run on Vercel)"
echo "   Deploy 0G storage first, then add URL here"
echo "   Add with: vercel env add NEXT_PUBLIC_STORAGE_API_URL production"
echo ""
echo -e "${RED}7. NEXT_PUBLIC_API_URL${NC}"
echo "   Description: Your Vercel deployment URL"
echo "   Example: https://frontend-xxx.vercel.app"
echo "   Add with: vercel env add NEXT_PUBLIC_API_URL production"
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${GREEN}✓${NC} Automatic configuration completed"
echo -e "${YELLOW}⚠️${NC} Manual configuration required (see above)"
echo ""
echo "Next steps:"
echo "1. Add the manual environment variables listed above"
echo "2. Deploy 0G storage service to a separate server"
echo "3. Configure database (Vercel Postgres or external)"
echo "4. Redeploy: vercel --prod"
echo ""
echo "For complete instructions, see:"
echo "  - VERCEL_DEPLOYMENT_GUIDE.md"
echo "  - VERCEL_DEPLOYMENT_SUCCESS.md"
echo ""
