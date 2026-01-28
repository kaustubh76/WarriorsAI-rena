#!/bin/bash
# Flow Testnet End-to-End Integration Test Script

set -e

echo "🧪 Flow Testnet Integration Test Suite"
echo "======================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration
FLOW_NETWORK="${FLOW_NETWORK:-emulator}"

# Test results
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
success() {
    echo -e "${GREEN}✓${NC} $1"
    ((TESTS_PASSED++))
}

fail() {
    echo -e "${RED}✗${NC} $1"
    ((TESTS_FAILED++))
}

info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

echo "1️⃣  Testing Flow Contracts"
echo "--------------------------"

# Test ScheduledBattle
info "Querying ScheduledBattle.getPendingTransactions()..."
if flow scripts execute <(echo 'import ScheduledBattle from 0xf8d6e0586b0a20c7

access(all) fun main(): [ScheduledBattle.ScheduledTransaction] {
    return ScheduledBattle.getPendingTransactions()
}') --network $FLOW_NETWORK 2>&1 | grep -q "Result:"; then
    success "ScheduledBattle contract works"
else
    fail "ScheduledBattle query failed"
fi

echo ""
echo "========================================="
echo "Test Results: Passed=$TESTS_PASSED Failed=$TESTS_FAILED"
echo "========================================="

[ $TESTS_FAILED -eq 0 ] && exit 0 || exit 1
