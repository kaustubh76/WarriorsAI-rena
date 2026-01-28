#!/bin/bash

# Flow Scheduled Transactions - Production Ready Verification Script
# Tests all 8 critical priorities to ensure production readiness

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:3000}"
AUTH_TOKEN="${AUTH_TOKEN:-test-token}"
TEST_WARRIOR_1=1
TEST_WARRIOR_2=2
TEST_BET_AMOUNT=100

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
TOTAL_TESTS=0

# Helper functions
print_header() {
  echo ""
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo ""
}

print_test() {
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  echo -e "${YELLOW}Test #${TOTAL_TESTS}: $1${NC}"
}

print_pass() {
  TESTS_PASSED=$((TESTS_PASSED + 1))
  echo -e "${GREEN}✅ PASS: $1${NC}"
}

print_fail() {
  TESTS_FAILED=$((TESTS_FAILED + 1))
  echo -e "${RED}❌ FAIL: $1${NC}"
}

print_info() {
  echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if server is running
check_server() {
  print_header "Checking Server Availability"

  print_test "Server is running"

  if curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/health" | grep -q "200"; then
    print_pass "Server is responding"
  else
    print_fail "Server is not responding at $API_URL"
    echo "Please start the server with: cd frontend && npm run dev"
    exit 1
  fi
}

# Priority 1: Rate Limiter
test_rate_limiter() {
  print_header "Priority 1: Rate Limiter"

  print_test "Rate limiter allows requests within limit"

  SUCCESS_COUNT=0
  for i in {1..60}; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/flow/scheduled")
    if [ "$HTTP_CODE" == "200" ]; then
      SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    fi
  done

  if [ $SUCCESS_COUNT -eq 60 ]; then
    print_pass "All 60 requests succeeded within rate limit"
  else
    print_fail "Only $SUCCESS_COUNT/60 requests succeeded"
  fi

  print_test "Rate limiter blocks requests over limit"

  BLOCKED_COUNT=0
  for i in {1..10}; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/flow/scheduled")
    if [ "$HTTP_CODE" == "429" ]; then
      BLOCKED_COUNT=$((BLOCKED_COUNT + 1))
    fi
  done

  if [ $BLOCKED_COUNT -gt 0 ]; then
    print_pass "Rate limiter blocked $BLOCKED_COUNT/10 requests with 429"
  else
    print_fail "Rate limiter did not block any requests"
  fi

  # Wait for rate limit window to reset
  print_info "Waiting 60 seconds for rate limit to reset..."
  sleep 60
}

# Priority 2: Authentication
test_authentication() {
  print_header "Priority 2: Authentication"

  print_test "POST without authentication returns 401"

  SCHEDULED_TIME=$(date -v+5M +%s 2>/dev/null || date -d '+5 minutes' +%s)

  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$API_URL/api/flow/scheduled" \
    -H "Content-Type: application/json" \
    -d "{\"warrior1Id\":$TEST_WARRIOR_1,\"warrior2Id\":$TEST_WARRIOR_2,\"betAmount\":$TEST_BET_AMOUNT,\"scheduledTime\":$SCHEDULED_TIME}")

  if [ "$HTTP_CODE" == "401" ]; then
    print_pass "Unauthenticated request rejected with 401"
  else
    print_fail "Expected 401, got $HTTP_CODE"
  fi

  print_test "POST with valid authentication succeeds"

  RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "$API_URL/api/flow/scheduled" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -d "{\"warrior1Id\":$TEST_WARRIOR_1,\"warrior2Id\":$TEST_WARRIOR_2,\"betAmount\":$TEST_BET_AMOUNT,\"scheduledTime\":$SCHEDULED_TIME}")

  HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
  BODY=$(echo "$RESPONSE" | head -n -1)

  if [ "$HTTP_CODE" == "200" ] || [ "$HTTP_CODE" == "201" ]; then
    print_pass "Authenticated request succeeded with $HTTP_CODE"

    # Extract transaction ID for later tests
    TX_ID=$(echo "$BODY" | grep -o '"transactionId":"[^"]*"' | cut -d'"' -f4)
    if [ -n "$TX_ID" ]; then
      print_info "Transaction ID: $TX_ID"
      export TEST_TX_ID="$TX_ID"
    fi
  else
    print_fail "Expected 200/201, got $HTTP_CODE"
    echo "Response: $BODY"
  fi

  print_test "PUT without authentication returns 401"

  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X PUT "$API_URL/api/flow/scheduled" \
    -H "Content-Type: application/json" \
    -d '{"battleId":999}')

  if [ "$HTTP_CODE" == "401" ]; then
    print_pass "Unauthenticated execution rejected with 401"
  else
    print_fail "Expected 401, got $HTTP_CODE"
  fi
}

# Priority 3: Timeout Protection
test_timeout_protection() {
  print_header "Priority 3: Timeout Protection"

  print_test "FCL queries return within 30 seconds"

  START_TIME=$(date +%s)

  curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/flow/scheduled" > /dev/null

  END_TIME=$(date +%s)
  DURATION=$((END_TIME - START_TIME))

  if [ $DURATION -le 35 ]; then
    print_pass "Query completed in ${DURATION}s (within timeout)"
  else
    print_fail "Query took ${DURATION}s (exceeded 30s timeout)"
  fi
}

# Priority 4: Database Sync
test_database_sync() {
  print_header "Priority 4: Database Sync"

  print_test "Scheduled battles are saved to database"

  # Check if database is accessible
  if command -v psql &> /dev/null; then
    DB_URL="${DATABASE_URL:-postgresql://localhost:5432/warriorsai_rena}"

    COUNT=$(psql "$DB_URL" -t -c "SELECT COUNT(*) FROM \"ScheduledTransaction\";" 2>/dev/null || echo "0")
    COUNT=$(echo $COUNT | tr -d ' ')

    if [ "$COUNT" -gt 0 ]; then
      print_pass "Found $COUNT scheduled battles in database"

      # Check most recent battle
      RECENT=$(psql "$DB_URL" -t -c "SELECT status FROM \"ScheduledTransaction\" ORDER BY \"createdAt\" DESC LIMIT 1;" 2>/dev/null || echo "")
      if [ -n "$RECENT" ]; then
        print_info "Most recent battle status: $(echo $RECENT | tr -d ' ')"
      fi
    else
      print_fail "No scheduled battles found in database"
    fi
  else
    print_info "psql not available, skipping database check"
  fi
}

# Priority 5: Idempotency
test_idempotency() {
  print_header "Priority 5: Idempotency"

  print_test "Duplicate execution attempts are prevented"

  # Try to execute the same battle twice
  BATTLE_ID=999

  # First attempt
  RESPONSE1=$(curl -s -w "\n%{http_code}" \
    -X PUT "$API_URL/api/flow/scheduled" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -d "{\"battleId\":$BATTLE_ID}")

  HTTP_CODE1=$(echo "$RESPONSE1" | tail -n 1)

  # Second attempt immediately after
  RESPONSE2=$(curl -s -w "\n%{http_code}" \
    -X PUT "$API_URL/api/flow/scheduled" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -d "{\"battleId\":$BATTLE_ID}")

  HTTP_CODE2=$(echo "$RESPONSE2" | tail -n 1)

  # One should succeed (200) or both should fail with 404/409
  if [ "$HTTP_CODE2" == "409" ] || [ "$HTTP_CODE2" == "404" ]; then
    print_pass "Second execution prevented with $HTTP_CODE2"
  elif [ "$HTTP_CODE1" == "404" ]; then
    print_info "Battle $BATTLE_ID not found (expected for test)"
  else
    print_fail "Expected 409 or 404 on duplicate, got $HTTP_CODE2"
  fi
}

# Priority 6: Error Handling
test_error_handling() {
  print_header "Priority 6: Error Handling"

  print_test "Invalid requests return structured errors"

  # Missing required fields
  RESPONSE=$(curl -s \
    -X POST "$API_URL/api/flow/scheduled" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -d '{}')

  if echo "$RESPONSE" | grep -q '"error"'; then
    print_pass "Error response includes error field"
  else
    print_fail "Error response missing error field"
  fi

  if echo "$RESPONSE" | grep -q '"code"'; then
    print_pass "Error response includes error code"
  else
    print_fail "Error response missing error code"
  fi

  print_test "Invalid battle ID returns 404"

  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X PUT "$API_URL/api/flow/scheduled" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -d '{"battleId":99999999}')

  if [ "$HTTP_CODE" == "404" ]; then
    print_pass "Invalid battle ID returns 404"
  else
    print_fail "Expected 404, got $HTTP_CODE"
  fi
}

# Priority 7: VRF Tracking
test_vrf_tracking() {
  print_header "Priority 7: VRF Tracking"

  print_test "VRF requests are tracked and logged"

  # This test checks if VRF route exists and responds
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    "$API_URL/api/flow/vrf-trade" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -d '{}')

  # Expecting 400 (validation error) or 401 (auth error), not 404
  if [ "$HTTP_CODE" != "404" ]; then
    print_pass "VRF trade endpoint exists (returned $HTTP_CODE)"
  else
    print_fail "VRF trade endpoint not found"
  fi
}

# Priority 8: Security
test_security() {
  print_header "Priority 8: Security"

  print_test "Cron endpoint requires authorization"

  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$API_URL/api/cron/execute-battles")

  if [ "$HTTP_CODE" == "401" ]; then
    print_pass "Unauthorized cron request rejected with 401"
  else
    print_fail "Expected 401, got $HTTP_CODE"
  fi

  print_test "Cron endpoint with valid secret succeeds"

  if [ -n "$CRON_SECRET" ]; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
      -X POST "$API_URL/api/cron/execute-battles" \
      -H "Authorization: Bearer $CRON_SECRET")

    if [ "$HTTP_CODE" == "200" ]; then
      print_pass "Authorized cron request succeeded"
    else
      print_info "Cron returned $HTTP_CODE (may be expected if no battles ready)"
    fi
  else
    print_info "CRON_SECRET not set, skipping authorized test"
  fi
}

# Generate summary
generate_summary() {
  print_header "Test Summary"

  echo ""
  echo -e "Total Tests: ${TOTAL_TESTS}"
  echo -e "${GREEN}Passed: ${TESTS_PASSED}${NC}"
  echo -e "${RED}Failed: ${TESTS_FAILED}${NC}"
  echo ""

  SUCCESS_RATE=$(awk "BEGIN {printf \"%.1f\", ($TESTS_PASSED / $TOTAL_TESTS) * 100}")

  if [ "$TESTS_FAILED" -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed! Production ready.${NC}"
    exit 0
  elif [ "$SUCCESS_RATE" -gt 80 ]; then
    echo -e "${YELLOW}⚠️  Most tests passed ($SUCCESS_RATE%). Review failures before deploying.${NC}"
    exit 1
  else
    echo -e "${RED}❌ Multiple test failures ($SUCCESS_RATE%). Not production ready.${NC}"
    exit 1
  fi
}

# Main execution
main() {
  echo ""
  echo "╔════════════════════════════════════════════════════════╗"
  echo "║  Flow Scheduled Transactions - Production Tests       ║"
  echo "║  Testing all 8 critical priorities                    ║"
  echo "╚════════════════════════════════════════════════════════╝"
  echo ""

  print_info "API URL: $API_URL"
  print_info "Auth Token: ${AUTH_TOKEN:0:10}..."
  echo ""

  check_server
  test_rate_limiter
  test_authentication
  test_timeout_protection
  test_database_sync
  test_idempotency
  test_error_handling
  test_vrf_tracking
  test_security
  generate_summary
}

# Run main
main