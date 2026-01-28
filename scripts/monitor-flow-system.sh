#!/bin/bash
################################################################################
# Flow System Monitoring Dashboard
#
# Real-time monitoring of Flow blockchain integration health
#
# Usage:
#   ./scripts/monitor-flow-system.sh
#
# Features:
# - RPC endpoint health and latency
# - Event listener sync status
# - Database statistics
# - Recent activity feed
# - System resource usage
#
# Requirements:
# - curl
# - jq
# - bc (for calculations)
################################################################################

set -e

# Configuration
API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
REFRESH_INTERVAL=5 # seconds
COLORS=true

# Color codes
if [ "$COLORS" = true ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    MAGENTA='\033[0;35m'
    CYAN='\033[0;36m'
    WHITE='\033[1;37m'
    GRAY='\033[0;90m'
    BOLD='\033[1m'
    NC='\033[0m' # No Color
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    MAGENTA=''
    CYAN=''
    WHITE=''
    GRAY=''
    BOLD=''
    NC=''
fi

################################################################################
# Helper Functions
################################################################################

print_header() {
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}$1${NC}"
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_section() {
    echo -e "\n${CYAN}${BOLD}$1${NC}"
    echo -e "${GRAY}────────────────────────────────────────────────────────────────${NC}"
}

status_indicator() {
    local status="$1"
    case "$status" in
        "healthy"|"true"|"synced"|"operational")
            echo -e "${GREEN}●${NC}"
            ;;
        "degraded"|"slow")
            echo -e "${YELLOW}●${NC}"
            ;;
        "unhealthy"|"false"|"not_synced"|"down")
            echo -e "${RED}●${NC}"
            ;;
        *)
            echo -e "${GRAY}●${NC}"
            ;;
    esac
}

format_number() {
    local num="$1"
    if command -v numfmt &> /dev/null; then
        numfmt --grouping "$num" 2>/dev/null || echo "$num"
    else
        printf "%'d\n" "$num" 2>/dev/null || echo "$num"
    fi
}

################################################################################
# Data Fetching Functions
################################################################################

fetch_rpc_health() {
    curl -s "${API_BASE_URL}/api/rpc/health" || echo '{"success":false,"error":"Failed to fetch"}'
}

fetch_event_status() {
    curl -s "${API_BASE_URL}/api/events/status" || echo '{"success":false,"error":"Failed to fetch"}'
}

fetch_flow_stats() {
    curl -s "${API_BASE_URL}/api/flow/execute" || echo '{"success":false,"error":"Failed to fetch"}'
}

################################################################################
# Display Functions
################################################################################

display_rpc_health() {
    print_section "🌐 RPC Endpoints"

    local data=$(fetch_rpc_health)

    if [ "$(echo "$data" | jq -r '.success')" = "true" ]; then
        local overall_status=$(echo "$data" | jq -r '.overall.status')
        local overall_message=$(echo "$data" | jq -r '.overall.message')

        echo -e "  Overall Status: $(status_indicator "$overall_status") ${overall_status} - ${overall_message}"

        # Primary RPC
        local primary_url=$(echo "$data" | jq -r '.endpoints.primary.url')
        local primary_status=$(echo "$data" | jq -r '.endpoints.primary.status')
        local primary_latency=$(echo "$data" | jq -r '.endpoints.primary.latency // "N/A"')
        local primary_block=$(echo "$data" | jq -r '.endpoints.primary.blockNumber // "N/A"')

        echo -e "\n  ${BOLD}Primary RPC:${NC} $primary_url"
        echo -e "    Status:  $(status_indicator "$primary_status") $primary_status"
        echo -e "    Latency: ${primary_latency}ms"
        echo -e "    Block:   $(format_number $primary_block)"

        # Fallback RPC
        local fallback_url=$(echo "$data" | jq -r '.endpoints.fallback.url')
        local fallback_status=$(echo "$data" | jq -r '.endpoints.fallback.status')
        local fallback_latency=$(echo "$data" | jq -r '.endpoints.fallback.latency // "N/A"')
        local fallback_block=$(echo "$data" | jq -r '.endpoints.fallback.blockNumber // "N/A"')

        echo -e "\n  ${BOLD}Fallback RPC:${NC} $fallback_url"
        echo -e "    Status:  $(status_indicator "$fallback_status") $fallback_status"
        echo -e "    Latency: ${fallback_latency}ms"
        echo -e "    Block:   $(format_number $fallback_block)"

        # Recommendations
        local recommendations=$(echo "$data" | jq -r '.overall.recommendations // [] | .[]' 2>/dev/null)
        if [ -n "$recommendations" ]; then
            echo -e "\n  ${YELLOW}⚠️  Recommendations:${NC}"
            echo "$recommendations" | while read -r rec; do
                echo -e "    • $rec"
            done
        fi
    else
        echo -e "  ${RED}✗ Failed to fetch RPC health${NC}"
    fi
}

display_event_status() {
    print_section "📡 Event Listener"

    local data=$(fetch_event_status)

    if [ "$(echo "$data" | jq -r '.success')" = "true" ]; then
        # Blockchain sync
        local current_block=$(echo "$data" | jq -r '.blockchain.currentBlock')
        local last_synced=$(echo "$data" | jq -r '.blockchain.lastSyncedBlock')
        local blocks_behind=$(echo "$data" | jq -r '.blockchain.blocksBehind')
        local is_synced=$(echo "$data" | jq -r '.blockchain.isSynced')
        local sync_pct=$(echo "$data" | jq -r '.blockchain.syncPercentage')

        echo -e "  ${BOLD}Blockchain Sync:${NC}"
        echo -e "    Status:       $(status_indicator "$is_synced") $([ "$is_synced" = "true" ] && echo "Synced" || echo "Behind")"
        echo -e "    Current:      $(format_number $current_block)"
        echo -e "    Last Synced:  $(format_number $last_synced)"
        echo -e "    Blocks Behind: ${blocks_behind}"
        echo -e "    Progress:     ${sync_pct}"

        # Statistics
        local total_markets=$(echo "$data" | jq -r '.statistics.totalMarkets')
        local total_trades=$(echo "$data" | jq -r '.statistics.totalTrades')
        local active_markets=$(echo "$data" | jq -r '.statistics.activeMarkets')
        local total_volume=$(echo "$data" | jq -r '.statistics.totalVolume')

        echo -e "\n  ${BOLD}Statistics:${NC}"
        echo -e "    Total Markets:  $(format_number $total_markets)"
        echo -e "    Active Markets: $(format_number $active_markets)"
        echo -e "    Total Trades:   $(format_number $total_trades)"
        echo -e "    Total Volume:   ${total_volume} CRwN"

        # Recent activity
        echo -e "\n  ${BOLD}Recent Activity:${NC}"
        echo "$data" | jq -r '.recentActivity[] | "    \(.timestamp | split("T")[0]) \(.timestamp | split("T")[1] | split(".")[0]) | \(.direction) \(.amount) | \(.txHash)"' 2>/dev/null | head -n 5 || echo "    No recent activity"

        # Health
        local health_status=$(echo "$data" | jq -r '.health.status')
        local health_message=$(echo "$data" | jq -r '.health.message')

        echo -e "\n  ${BOLD}Health:${NC} $(status_indicator "$health_status") $health_message"
    else
        echo -e "  ${RED}✗ Failed to fetch event status${NC}"
        echo -e "  ${GRAY}Hint: Make sure event listeners are running${NC}"
    fi
}

display_flow_stats() {
    print_section "⚡ Flow Contract Stats"

    local data=$(fetch_flow_stats)

    if [ "$(echo "$data" | jq -r '.success')" = "true" ]; then
        local status=$(echo "$data" | jq -r '.status')
        local total_mirrors=$(echo "$data" | jq -r '.stats.totalMirrors // "0"')
        local total_volume=$(echo "$data" | jq -r '.stats.totalVolume // "0"')
        local contract_addr=$(echo "$data" | jq -r '.config.contractAddress')
        local chain=$(echo "$data" | jq -r '.config.chain')

        echo -e "  ${BOLD}Contract:${NC} $contract_addr"
        echo -e "  ${BOLD}Chain:${NC}    $chain"
        echo -e "  ${BOLD}Status:${NC}   $(status_indicator "$status") $status"
        echo -e "\n  ${BOLD}Metrics:${NC}"
        echo -e "    Mirror Markets: $(format_number $total_mirrors)"
        echo -e "    Total Volume:   ${total_volume} CRwN"
    else
        echo -e "  ${RED}✗ Failed to fetch Flow stats${NC}"
    fi
}

display_system_resources() {
    print_section "💻 System Resources"

    # CPU Usage
    if command -v top &> /dev/null; then
        local cpu_usage=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')
        echo -e "  ${BOLD}CPU Usage:${NC}    ${cpu_usage}%"
    fi

    # Memory Usage
    if command -v free &> /dev/null; then
        local mem_info=$(free -m | awk 'NR==2{printf "%.1f%%", $3*100/$2 }')
        echo -e "  ${BOLD}Memory Usage:${NC} ${mem_info}"
    fi

    # Disk Usage
    if command -v df &> /dev/null; then
        local disk_usage=$(df -h / | awk 'NR==2{print $5}')
        echo -e "  ${BOLD}Disk Usage:${NC}   ${disk_usage}"
    fi

    # Uptime
    if command -v uptime &> /dev/null; then
        local uptime_info=$(uptime -p 2>/dev/null || uptime | awk -F'( |,|:)+' '{print $6,$7",",$8,$9}')
        echo -e "  ${BOLD}Uptime:${NC}       ${uptime_info}"
    fi
}

################################################################################
# Main Dashboard Loop
################################################################################

main_dashboard() {
    while true; do
        clear

        # Header
        print_header "🏆 Flow System Monitoring Dashboard"
        echo -e "${GRAY}Last updated: $(date '+%Y-%m-%d %H:%M:%S')${NC}"
        echo -e "${GRAY}Refresh interval: ${REFRESH_INTERVAL}s | Press Ctrl+C to exit${NC}"

        # Display sections
        display_rpc_health
        display_event_status
        display_flow_stats
        display_system_resources

        # Footer
        echo -e "\n${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${GRAY}API Base URL: ${API_BASE_URL}${NC}"

        # Wait before refresh
        sleep $REFRESH_INTERVAL
    done
}

################################################################################
# Entry Point
################################################################################

# Check dependencies
for cmd in curl jq; do
    if ! command -v $cmd &> /dev/null; then
        echo -e "${RED}Error: $cmd is required but not installed.${NC}"
        echo "Please install $cmd and try again."
        exit 1
    fi
done

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --url)
            API_BASE_URL="$2"
            shift 2
            ;;
        --interval)
            REFRESH_INTERVAL="$2"
            shift 2
            ;;
        --no-colors)
            COLORS=false
            shift
            ;;
        *)
            echo "Usage: $0 [--url URL] [--interval SECONDS] [--no-colors]"
            exit 1
            ;;
    esac
done

# Run dashboard
main_dashboard
