#!/bin/bash
################################################################################
# Vercel Deployment Script
#
# Deploys Warriors AI Flow Testnet frontend to Vercel
#
# Usage:
#   ./scripts/deploy-vercel.sh [production|preview]
################################################################################

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

DEPLOY_TYPE="${1:-preview}"

clear
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}🚀 Warriors AI - Vercel Deployment${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo -e "${RED}❌ Vercel CLI not found${NC}"
    echo ""
    echo "Install it with:"
    echo -e "${CYAN}npm install -g vercel${NC}"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ Vercel CLI installed${NC}"
echo ""

# Navigate to frontend directory
cd "$FRONTEND_DIR"

# Pre-deployment checks
echo -e "${CYAN}${BOLD}Step 1: Pre-deployment checks${NC}"
echo ""

# Check if .env exists
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠ Warning: .env file not found${NC}"
    echo "  Make sure to configure environment variables in Vercel Dashboard"
    echo ""
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}ℹ Installing dependencies...${NC}"
    npm install
    echo ""
fi

# Check if build works
echo -e "${BLUE}ℹ Testing build...${NC}"
if npm run build > /tmp/vercel-build.log 2>&1; then
    echo -e "${GREEN}✓ Build successful${NC}"
else
    echo -e "${RED}❌ Build failed${NC}"
    echo "Check logs: tail /tmp/vercel-build.log"
    exit 1
fi
echo ""

# Deployment
echo -e "${CYAN}${BOLD}Step 2: Deploying to Vercel${NC}"
echo ""

if [ "$DEPLOY_TYPE" = "production" ] || [ "$DEPLOY_TYPE" = "prod" ]; then
    echo -e "${BOLD}Deploying to PRODUCTION...${NC}"
    echo ""
    vercel --prod
else
    echo -e "${BOLD}Deploying to PREVIEW...${NC}"
    echo ""
    vercel
fi

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}✅ Deployment Complete!${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BOLD}📚 Next Steps:${NC}"
echo ""
echo "1. Configure environment variables in Vercel Dashboard:"
echo "   https://vercel.com/your-team/frontend/settings/environment-variables"
echo ""
echo "2. Verify deployment:"
echo -e "   ${CYAN}vercel logs --follow${NC}"
echo ""
echo "3. Test API endpoints:"
echo -e "   ${CYAN}curl https://your-app.vercel.app/api/flow/execute${NC}"
echo ""
echo "4. Monitor metrics:"
echo -e "   ${CYAN}curl https://your-app.vercel.app/api/metrics${NC}"
echo ""
echo -e "${BOLD}📖 Full deployment guide:${NC}"
echo "   $PROJECT_ROOT/VERCEL_DEPLOYMENT_GUIDE.md"
echo ""
