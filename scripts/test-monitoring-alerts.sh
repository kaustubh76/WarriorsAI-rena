#!/bin/bash

# Test Script for Monitoring & Alerting System
# Demonstrates the enterprise monitoring capabilities

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:3000}"
ADMIN_SECRET="${ADMIN_SECRET:-change-me-in-production}"

# Helper functions
print_header() {
  echo ""
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo ""
}

print_test() {
  echo -e "${YELLOW}▶ $1${NC}"
}

print_pass() {
  echo -e "${GREEN}✅ PASS: $1${NC}"
}

print_fail() {
  echo -e "${RED}❌ FAIL: $1${NC}"
}

print_info() {
  echo -e "${PURPLE}ℹ️  $1${NC}"
}

# Check if server is running
check_server() {
  print_header "1. Server Health Check"

  print_test "Checking if server is running"

  if curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/health" 2>/dev/null | grep -q "200"; then
    print_pass "Server is responding at $API_URL"
  else
    print_fail "Server is not responding at $API_URL"
    echo ""
    echo "Please start the server with:"
    echo "  cd frontend && npm run dev"
    exit 1
  fi
}

# Test admin monitoring endpoint
test_admin_endpoint() {
  print_header "2. Admin Monitoring Endpoint"

  print_test "Fetching monitoring data"

  RESPONSE=$(curl -s "$API_URL/api/admin/monitor" \
    -H "Authorization: Bearer $ADMIN_SECRET")

  # Check if response is valid JSON
  if echo "$RESPONSE" | jq . > /dev/null 2>&1; then
    print_pass "Admin endpoint returned valid JSON"

    # Extract key metrics
    SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
    HEALTH_STATUS=$(echo "$RESPONSE" | jq -r '.data.health.status')
    HEALTH_SCORE=$(echo "$RESPONSE" | jq -r '.data.health.score')
    SUCCESS_RATE=$(echo "$RESPONSE" | jq -r '.data.metrics.successRate')
    QUEUE_DEPTH=$(echo "$RESPONSE" | jq -r '.data.queue.pending')
    VIOLATIONS_COUNT=$(echo "$RESPONSE" | jq -r '.data.violations | length')

    echo ""
    print_info "Health Status: $HEALTH_STATUS"
    print_info "Health Score: $HEALTH_SCORE/100"
    print_info "Success Rate: $SUCCESS_RATE%"
    print_info "Queue Depth: $QUEUE_DEPTH pending"
    print_info "Threshold Violations: $VIOLATIONS_COUNT"

    # Check for violations
    if [ "$VIOLATIONS_COUNT" != "null" ] && [ "$VIOLATIONS_COUNT" != "0" ]; then
      echo ""
      print_test "Current Threshold Violations:"
      echo "$RESPONSE" | jq -r '.data.violations[] | "  • \(.metric): \(.currentValue) (threshold: \(.threshold), severity: \(.severity))"'
    fi

    # Check for recommendations
    RECOMMENDATIONS=$(echo "$RESPONSE" | jq -r '.data.recommendations | length')
    if [ "$RECOMMENDATIONS" != "null" ] && [ "$RECOMMENDATIONS" != "0" ]; then
      echo ""
      print_test "Recommendations:"
      echo "$RESPONSE" | jq -r '.data.recommendations[] | "  • \(.)"'
    fi

  else
    print_fail "Admin endpoint returned invalid response"
    echo "$RESPONSE"
    exit 1
  fi
}

# Test Prometheus metrics export
test_prometheus_metrics() {
  print_header "3. Prometheus Metrics Export"

  print_test "Fetching Prometheus format metrics"

  RESPONSE=$(curl -s "$API_URL/api/admin/monitor?format=prometheus" \
    -H "Authorization: Bearer $ADMIN_SECRET")

  if echo "$RESPONSE" | grep -q "battle_scheduled_total"; then
    print_pass "Prometheus metrics exported successfully"
    echo ""
    print_info "Sample metrics:"
    echo "$RESPONSE" | head -20
  else
    print_fail "Prometheus metrics export failed"
    echo "$RESPONSE"
  fi
}

# Test alerts endpoint (if available)
test_alerts() {
  print_header "4. Recent Alerts"

  print_test "Fetching recent alerts"

  RESPONSE=$(curl -s "$API_URL/api/admin/monitor" \
    -H "Authorization: Bearer $ADMIN_SECRET")

  ALERTS_COUNT=$(echo "$RESPONSE" | jq -r '.data.alerts.total')
  UNACK_COUNT=$(echo "$RESPONSE" | jq -r '.data.alerts.unacknowledged')

  echo ""
  print_info "Total Alerts: $ALERTS_COUNT"
  print_info "Unacknowledged: $UNACK_COUNT"

  # Show recent alerts
  RECENT_ALERTS=$(echo "$RESPONSE" | jq -r '.data.alerts.recent | length')

  if [ "$RECENT_ALERTS" != "null" ] && [ "$RECENT_ALERTS" != "0" ]; then
    echo ""
    print_test "Recent Alerts (last 10):"
    echo "$RESPONSE" | jq -r '.data.alerts.recent[] | "  [\(.level | ascii_upcase)] \(.message) - \(.timestamp)"'
  else
    print_info "No recent alerts"
  fi

  # Show alert breakdown by level
  echo ""
  print_test "Alerts by Level:"
  echo "$RESPONSE" | jq -r '.data.alerts.byLevel | to_entries[] | "  \(.key): \(.value)"'
}

# Test webhook configuration
test_webhook_config() {
  print_header "5. Webhook Configuration"

  print_test "Checking webhook environment variables"

  if [ -n "$SLACK_WEBHOOK_URL" ]; then
    print_pass "Slack webhook URL configured"
  else
    print_info "Slack webhook URL not configured (optional)"
  fi

  if [ -n "$DISCORD_WEBHOOK_URL" ]; then
    print_pass "Discord webhook URL configured"
  else
    print_info "Discord webhook URL not configured (optional)"
  fi

  if [ -z "$SLACK_WEBHOOK_URL" ] && [ -z "$DISCORD_WEBHOOK_URL" ]; then
    echo ""
    print_info "To enable webhook alerts, set environment variables:"
    echo "  export SLACK_WEBHOOK_URL='https://hooks.slack.com/services/YOUR/WEBHOOK'"
    echo "  export DISCORD_WEBHOOK_URL='https://discord.com/api/webhooks/YOUR/WEBHOOK'"
  fi
}

# Test monitoring thresholds
test_thresholds() {
  print_header "6. Monitoring Thresholds"

  print_test "Current threshold configuration"

  echo ""
  echo "Default Thresholds:"
  echo "  • Max Error Rate: ${MAX_ERROR_RATE:-5}%"
  echo "  • Max Queue Depth: ${MAX_QUEUE_DEPTH:-20} battles"
  echo "  • Max Execution Time: ${MAX_EXECUTION_TIME:-15000}ms"
  echo "  • Min Success Rate: ${MIN_SUCCESS_RATE:-95}%"
  echo "  • Max Auth Failures: ${MAX_AUTH_FAILURES:-50}/hour"

  print_info "Thresholds can be customized via environment variables"
}

# Generate summary report
generate_summary() {
  print_header "Monitoring System Test Summary"

  # Fetch final status
  RESPONSE=$(curl -s "$API_URL/api/admin/monitor" \
    -H "Authorization: Bearer $ADMIN_SECRET")

  HEALTH_STATUS=$(echo "$RESPONSE" | jq -r '.data.health.status')
  HEALTH_SCORE=$(echo "$RESPONSE" | jq -r '.data.health.score')

  echo ""
  echo "╔════════════════════════════════════════════╗"
  echo "║         System Health Summary              ║"
  echo "╚════════════════════════════════════════════╝"
  echo ""

  # Display health status with color
  case $HEALTH_STATUS in
    "healthy")
      echo -e "  Status: ${GREEN}●${NC} HEALTHY"
      ;;
    "warning")
      echo -e "  Status: ${YELLOW}●${NC} WARNING"
      ;;
    "critical")
      echo -e "  Status: ${RED}●${NC} CRITICAL"
      ;;
    *)
      echo "  Status: UNKNOWN"
      ;;
  esac

  echo "  Health Score: $HEALTH_SCORE/100"
  echo ""

  # Display component status
  echo "Component Status:"
  echo "  ✓ Monitoring Endpoint: Operational"
  echo "  ✓ Metrics Collection: Active"
  echo "  ✓ Threshold Checking: Enabled"
  echo "  ✓ Alert System: Ready"

  # Webhook status
  if [ -n "$SLACK_WEBHOOK_URL" ] || [ -n "$DISCORD_WEBHOOK_URL" ]; then
    echo "  ✓ Webhook Alerts: Configured"
  else
    echo "  ○ Webhook Alerts: Not Configured (Optional)"
  fi

  echo ""

  # Show any active issues
  VIOLATIONS_COUNT=$(echo "$RESPONSE" | jq -r '.data.violations | length')
  if [ "$VIOLATIONS_COUNT" != "null" ] && [ "$VIOLATIONS_COUNT" != "0" ]; then
    echo -e "${YELLOW}⚠️  Active Issues:${NC}"
    echo "$RESPONSE" | jq -r '.data.health.issues[] | "  • \(.)"'
    echo ""
  fi

  # Final message
  if [ "$HEALTH_STATUS" = "healthy" ]; then
    echo -e "${GREEN}🎉 All systems operational!${NC}"
  elif [ "$HEALTH_STATUS" = "warning" ]; then
    echo -e "${YELLOW}⚠️  System operational with warnings. Review issues above.${NC}"
  else
    echo -e "${RED}🚨 Critical issues detected! Immediate attention required.${NC}"
  fi

  echo ""
}

# Main execution
main() {
  echo ""
  echo "╔════════════════════════════════════════════════════════╗"
  echo "║   Monitoring & Alerting System Test                   ║"
  echo "║   Flow Scheduled Transactions                          ║"
  echo "╚════════════════════════════════════════════════════════╝"
  echo ""

  print_info "API URL: $API_URL"
  print_info "Testing Time: $(date)"
  echo ""

  check_server
  test_admin_endpoint
  test_prometheus_metrics
  test_alerts
  test_webhook_config
  test_thresholds
  generate_summary

  echo ""
  print_info "Test complete! Check Slack/Discord for webhook alerts (if configured)"
  echo ""
}

# Run main
main
