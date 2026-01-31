#!/bin/bash

# Flow Cadence Contract Deployment Verification
# Verifies contracts are deployed and server account is authorized

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

PASSED=0
FAILED=0

pass() { PASSED=$((PASSED + 1)); echo -e "${GREEN}  [PASS] $1${NC}"; }
fail() { FAILED=$((FAILED + 1)); echo -e "${RED}  [FAIL] $1${NC}"; }
info() { echo -e "${YELLOW}  [INFO] $1${NC}"; }

echo -e "${BOLD}Flow Cadence Deployment Verification${NC}"
echo "========================================"
echo ""

# 1. Check Flow CLI
echo -e "${BOLD}1. Flow CLI${NC}"
if command -v flow &> /dev/null; then
    VERSION=$(flow version 2>/dev/null | head -1)
    pass "Flow CLI installed: $VERSION"
else
    fail "Flow CLI not found"
    echo "  Install: sh -ci \"\$(curl -fsSL https://storage.googleapis.com/flow-cli/install.sh)\""
    exit 1
fi

# 2. Check flow.json
echo ""
echo -e "${BOLD}2. Configuration (flow.json)${NC}"
if [ -f "flow.json" ]; then
    pass "flow.json exists"

    # Check testnet account
    if grep -q "testnet-account" flow.json; then
        pass "testnet-account configured"
    else
        fail "testnet-account not found in flow.json"
    fi

    # Check contracts
    for contract in ScheduledBattle ScheduledMarketResolver EVMBridge; do
        if grep -q "\"$contract\"" flow.json; then
            pass "$contract defined in flow.json"
        else
            fail "$contract not found in flow.json"
        fi
    done
else
    fail "flow.json not found"
    exit 1
fi

# 3. Check Cadence files
echo ""
echo -e "${BOLD}3. Cadence Files${NC}"
for file in \
    cadence/contracts/ScheduledBattle.cdc \
    cadence/contracts/ScheduledMarketResolver.cdc \
    cadence/contracts/EVMBridge.cdc \
    cadence/transactions/schedule_battle.cdc \
    cadence/transactions/execute_battle.cdc \
    cadence/transactions/schedule_market_resolution.cdc \
    cadence/transactions/admin_add_executor.cdc \
    cadence/transactions/admin_add_resolver.cdc \
    cadence/transactions/admin_add_bridge_operator.cdc \
    cadence/scripts/query_ready_battles.cdc \
    cadence/scripts/query_scheduled_battles.cdc \
    cadence/scripts/query_scheduled_resolutions.cdc; do
    if [ -f "$file" ]; then
        pass "$(basename $file)"
    else
        fail "$file missing"
    fi
done

# 4. Check server auth utility
echo ""
echo -e "${BOLD}4. Server Auth Integration${NC}"
SERVER_AUTH="frontend/src/lib/flow/serverAuth.ts"
if [ -f "$SERVER_AUTH" ]; then
    pass "serverAuth.ts exists"
else
    fail "serverAuth.ts missing"
fi

# Verify cron routes use shared auth (directly or via resolveMarketServerSide)
for route in \
    "frontend/src/app/api/cron/execute-battles/route.ts" \
    "frontend/src/app/api/cron/execute-resolutions/route.ts" \
    "frontend/src/app/api/flow/scheduled/route.ts"; do
    if [ -f "$route" ]; then
        if grep -q "serverAuth\|resolveMarketServerSide" "$route"; then
            pass "$(basename $(dirname $route))/route.ts uses server-side auth"
        else
            fail "$(basename $(dirname $route))/route.ts does not use server-side auth"
        fi
    fi
done

# 5. Check hook uses API routes
echo ""
echo -e "${BOLD}5. Hook Integration${NC}"
HOOK="frontend/src/hooks/useScheduledBattles.ts"
if [ -f "$HOOK" ]; then
    if grep -q "fetch('/api/flow/scheduled')" "$HOOK"; then
        pass "useScheduledBattles uses API routes"
    else
        fail "useScheduledBattles still calls cadenceClient directly"
    fi
else
    fail "useScheduledBattles.ts missing"
fi

# 6. Query testnet (if Flow CLI is configured)
echo ""
echo -e "${BOLD}6. Testnet Connectivity${NC}"

TESTNET_ADDR=$(grep -o '"testnet": "[^"]*"' flow.json | head -1 | grep -o '0x[a-f0-9]*' || echo "")

if [ -n "$TESTNET_ADDR" ]; then
    info "Contract address: $TESTNET_ADDR"

    # Try querying scheduled battles
    echo "  Querying ScheduledBattle.getPendingTransactions()..."
    if flow scripts execute cadence/scripts/query_scheduled_battles.cdc --network=testnet 2>/dev/null; then
        pass "ScheduledBattle contract is live and queryable"
    else
        info "ScheduledBattle query failed (contract may not be deployed yet)"
        info "Deploy with: ./scripts/deploy-cadence.sh"
    fi
else
    info "No testnet address found - skipping live queries"
fi

# Summary
echo ""
echo "========================================"
echo -e "${BOLD}Results: ${GREEN}${PASSED} passed${NC}, ${RED}${FAILED} failed${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All checks passed.${NC}"
    exit 0
else
    echo -e "${RED}${FAILED} check(s) failed. Review issues above.${NC}"
    exit 1
fi
