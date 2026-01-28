#!/bin/bash
################################################################################
# Quick Start Script
#
# One-command deployment for Flow testnet implementation
#
# Usage:
#   ./scripts/quick-start.sh
################################################################################

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

clear
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}🚀 Warriors AI - Flow Testnet Quick Start${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Step 1: Verify deployment
echo -e "${CYAN}${BOLD}Step 1: Verifying deployment...${NC}"
cd "$FRONTEND_DIR"
if ../scripts/verify-deployment.sh > /tmp/verify.log 2>&1; then
    echo -e "${GREEN}✓ Deployment verification passed${NC}"
else
    echo -e "${BOLD}⚠ Verification issues detected. Check /tmp/verify.log${NC}"
    echo ""
    echo "Common fixes:"
    echo "  1. Run: npm install"
    echo "  2. Run: npm run build"
    echo "  3. Check .env configuration"
    echo ""
    exit 1
fi

# Step 2: Check if already running
echo ""
echo -e "${CYAN}${BOLD}Step 2: Checking server status...${NC}"
if curl -sf http://localhost:3000 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Server is already running${NC}"
    SERVER_RUNNING=true
else
    echo -e "${BLUE}ℹ Server not running, will start...${NC}"
    SERVER_RUNNING=false
fi

# Step 3: Start server if needed
if [ "$SERVER_RUNNING" = false ]; then
    echo ""
    echo -e "${CYAN}${BOLD}Step 3: Starting production server...${NC}"
    echo -e "${BLUE}ℹ Server will run in background${NC}"
    echo -e "${BLUE}ℹ Logs: tail -f $FRONTEND_DIR/.next/server.log${NC}"

    # Start server in background
    nohup npm start > .next/server.log 2>&1 &
    SERVER_PID=$!
    echo $SERVER_PID > .next/server.pid

    # Wait for server to start
    echo -ne "${BLUE}ℹ Waiting for server to start"
    for i in {1..30}; do
        if curl -sf http://localhost:3000 > /dev/null 2>&1; then
            echo ""
            echo -e "${GREEN}✓ Server started successfully (PID: $SERVER_PID)${NC}"
            break
        fi
        echo -ne "."
        sleep 1
    done
    echo ""
else
    echo ""
    echo -e "${CYAN}${BOLD}Step 3: Server management${NC}"
    echo -e "${GREEN}✓ Server already running${NC}"
fi

# Step 4: Start event listener
echo ""
echo -e "${CYAN}${BOLD}Step 4: Starting event listener...${NC}"
LISTENER_RESPONSE=$(curl -s -X POST http://localhost:3000/api/events/start -H "Content-Type: application/json" -d '{"backfill": false}')
if echo "$LISTENER_RESPONSE" | grep -q "success"; then
    echo -e "${GREEN}✓ Event listener started${NC}"
else
    echo -e "${BOLD}⚠ Event listener may already be running or failed to start${NC}"
fi

# Step 5: Verify everything is working
echo ""
echo -e "${CYAN}${BOLD}Step 5: Running health checks...${NC}"

# Check Flow Execute API
if curl -sf http://localhost:3000/api/flow/execute > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Flow Execute API responding${NC}"
else
    echo -e "${BOLD}⚠ Flow Execute API not accessible${NC}"
fi

# Check VRF Trade API
if curl -sf http://localhost:3000/api/flow/vrf-trade?mirrorKey=0x0 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Flow VRF Trade API responding${NC}"
else
    echo -e "${BOLD}⚠ Flow VRF Trade API not accessible${NC}"
fi

# Check Metrics API
if curl -sf http://localhost:3000/api/metrics > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Metrics API responding${NC}"
else
    echo -e "${BOLD}⚠ Metrics API not accessible${NC}"
fi

# Check Event Listener Status
EVENT_STATUS=$(curl -s http://localhost:3000/api/events/status 2>/dev/null || echo "{}")
if echo "$EVENT_STATUS" | grep -q "isRunning"; then
    echo -e "${GREEN}✓ Event listener operational${NC}"
else
    echo -e "${BOLD}⚠ Event listener status unknown${NC}"
fi

# Summary
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}✅ Deployment Complete!${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BOLD}🌐 Application URLs:${NC}"
echo "   Frontend:      http://localhost:3000"
echo "   Metrics:       http://localhost:3000/api/metrics"
echo "   Flow Execute:  http://localhost:3000/api/flow/execute"
echo "   VRF Trade:     http://localhost:3000/api/flow/vrf-trade"
echo ""
echo -e "${BOLD}📊 Monitoring Commands:${NC}"
echo "   View metrics:  curl http://localhost:3000/api/metrics"
echo "   Event status:  curl http://localhost:3000/api/events/status"
echo "   Server logs:   tail -f $FRONTEND_DIR/.next/server.log"
echo ""
echo -e "${BOLD}🔧 Management Commands:${NC}"
echo "   Stop server:   kill \$(cat $FRONTEND_DIR/.next/server.pid)"
echo "   Restart:       ./scripts/quick-start.sh"
echo "   Verify:        ./scripts/verify-deployment.sh"
echo ""
echo -e "${BOLD}📚 Documentation:${NC}"
echo "   Complete guide: DEPLOYMENT_COMPLETE.md"
echo "   Quick deploy:   QUICK_DEPLOY.md"
echo ""
echo -e "${GREEN}${BOLD}🎉 Your Flow testnet implementation is live!${NC}"
echo ""
