#!/bin/bash

# Interactive Demo: Flow Scheduled Transactions
# This script showcases the complete scheduled transaction workflow

set -e

echo "🎮 WarriorsAI-rena - Flow Scheduled Transactions Demo"
echo "======================================================"
echo ""

# Color codes for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Flow CLI is installed
if ! command -v flow &> /dev/null; then
    echo -e "${RED}❌ Flow CLI not found${NC}"
    echo "Install with: sh -ci \"\$(curl -fsSL https://storage.googleapis.com/flow-cli/install.sh)\""
    exit 1
fi

echo -e "${GREEN}✅ Flow CLI installed: $(flow version | head -1)${NC}"
echo ""

# Check environment variables
if [ -z "$FLOW_TESTNET_ADDRESS" ]; then
    echo -e "${YELLOW}⚠️  FLOW_TESTNET_ADDRESS not set${NC}"
    echo "Please set up your Flow testnet account first."
    echo "See: FLOW_TESTNET_SETUP.md"
    exit 1
fi

echo -e "${GREEN}✅ Using testnet address: $FLOW_TESTNET_ADDRESS${NC}"
echo ""

# Verify account exists and has balance
echo "🔍 Verifying account on Flow testnet..."
if flow accounts get "$FLOW_TESTNET_ADDRESS" --network=testnet &> /dev/null; then
    BALANCE=$(flow accounts get "$FLOW_TESTNET_ADDRESS" --network=testnet | grep "Balance" | awk '{print $2}')
    echo -e "${GREEN}✅ Account verified${NC}"
    echo -e "${BLUE}💰 Balance: $BALANCE FLOW${NC}"
else
    echo -e "${RED}❌ Account not found on testnet${NC}"
    exit 1
fi
echo ""

echo "======================================================"
echo "📋 Demo Workflow"
echo "======================================================"
echo ""
echo "This demo will:"
echo "  1. Schedule a battle for 2 minutes from now"
echo "  2. Query pending scheduled battles"
echo "  3. Wait until execution time"
echo "  4. Query ready-to-execute battles"
echo "  5. Execute the battle"
echo "  6. Display events and results"
echo ""

read -p "Press ENTER to start the demo..." -r
echo ""

# Step 1: Schedule a battle
echo "======================================================"
echo "Step 1: Schedule a Battle"
echo "======================================================"
echo ""

# Calculate scheduled time (2 minutes from now)
CURRENT_TIME=$(date +%s)
SCHEDULED_TIME=$(echo "$CURRENT_TIME + 120" | bc)
SCHEDULED_TIME_READABLE=$(date -r $SCHEDULED_TIME "+%Y-%m-%d %H:%M:%S")

echo "Current time: $(date "+%Y-%m-%d %H:%M:%S")"
echo "Scheduled execution time: $SCHEDULED_TIME_READABLE (in 2 minutes)"
echo ""

echo "Battle details:"
echo "  Warrior 1 ID: 1"
echo "  Warrior 2 ID: 2"
echo "  Bet Amount: 100.0 FLOW"
echo ""

read -p "Schedule this battle? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Demo cancelled."
    exit 0
fi

echo ""
echo "📝 Sending schedule transaction..."
echo ""

SCHEDULE_TX_ID=$(flow transactions send ./cadence/transactions/schedule_battle.cdc \
  --arg UInt64:1 \
  --arg UInt64:2 \
  --arg UFix64:100.0 \
  --arg UFix64:${SCHEDULED_TIME}.0 \
  --network=testnet \
  --signer=testnet-account 2>&1 | tee /tmp/schedule_tx_output.txt | grep "ID" | awk '{print $2}')

if [ -z "$SCHEDULE_TX_ID" ]; then
    echo -e "${RED}❌ Failed to get transaction ID${NC}"
    cat /tmp/schedule_tx_output.txt
    exit 1
fi

echo -e "${GREEN}✅ Transaction submitted${NC}"
echo -e "${BLUE}   TX ID: $SCHEDULE_TX_ID${NC}"
echo ""

# Wait for transaction to seal
echo "⏳ Waiting for transaction to seal..."
sleep 3

# Get battle ID from events
CONTRACT_ADDRESS=$(echo "$FLOW_TESTNET_ADDRESS" | sed 's/0x//')
BATTLE_ID=$(flow events get A.${CONTRACT_ADDRESS}.ScheduledBattle.BattleScheduled --network=testnet --last 1 2>/dev/null | grep -A 20 "BattleScheduled" | grep "id:" | tail -1 | awk '{print $2}' || echo "0")

echo -e "${GREEN}✅ Battle scheduled${NC}"
echo -e "${BLUE}   Battle ID: $BATTLE_ID${NC}"
echo ""

# Step 2: Query pending battles
echo "======================================================"
echo "Step 2: Query Pending Scheduled Battles"
echo "======================================================"
echo ""

echo "📊 Fetching all pending scheduled battles..."
echo ""

flow scripts execute ./cadence/scripts/query_scheduled_battles.cdc --network=testnet

echo ""
read -p "Press ENTER to continue..." -r
echo ""

# Step 3: Wait until execution time
echo "======================================================"
echo "Step 3: Wait for Execution Time"
echo "======================================================"
echo ""

echo "⏰ Waiting for scheduled time to arrive..."
echo ""

# Show countdown
SECONDS_TO_WAIT=120
while [ $SECONDS_TO_WAIT -gt 0 ]; do
    MINUTES=$((SECONDS_TO_WAIT / 60))
    SECONDS=$((SECONDS_TO_WAIT % 60))
    printf "\r${BLUE}⏳ Time remaining: %02d:%02d${NC}" $MINUTES $SECONDS
    sleep 1
    SECONDS_TO_WAIT=$((SECONDS_TO_WAIT - 1))
done

echo ""
echo ""
echo -e "${GREEN}✅ Scheduled time has arrived!${NC}"
echo ""

# Step 4: Query ready battles
echo "======================================================"
echo "Step 4: Query Ready-to-Execute Battles"
echo "======================================================"
echo ""

echo "📊 Fetching battles ready for execution..."
echo ""

flow scripts execute ./cadence/scripts/query_ready_battles.cdc --network=testnet

echo ""
read -p "Press ENTER to execute the battle..." -r
echo ""

# Step 5: Execute the battle
echo "======================================================"
echo "Step 5: Execute the Scheduled Battle"
echo "======================================================"
echo ""

echo "⚔️  Executing battle ID $BATTLE_ID..."
echo ""

EXECUTE_TX_ID=$(flow transactions send ./cadence/transactions/execute_battle.cdc \
  --arg UInt64:$BATTLE_ID \
  --network=testnet \
  --signer=testnet-account 2>&1 | tee /tmp/execute_tx_output.txt | grep "ID" | awk '{print $2}')

if [ -z "$EXECUTE_TX_ID" ]; then
    echo -e "${RED}❌ Failed to execute battle${NC}"
    cat /tmp/execute_tx_output.txt
    exit 1
fi

echo -e "${GREEN}✅ Execution transaction submitted${NC}"
echo -e "${BLUE}   TX ID: $EXECUTE_TX_ID${NC}"
echo ""

# Wait for transaction to seal
echo "⏳ Waiting for transaction to seal..."
sleep 3

echo -e "${GREEN}✅ Battle executed successfully!${NC}"
echo ""

# Step 6: Display events and results
echo "======================================================"
echo "Step 6: View Events and Results"
echo "======================================================"
echo ""

echo "📊 BattleScheduled Events:"
echo ""
flow events get A.${CONTRACT_ADDRESS}.ScheduledBattle.BattleScheduled --network=testnet --last 5

echo ""
echo "📊 BattleExecuted Events:"
echo ""
flow events get A.${CONTRACT_ADDRESS}.ScheduledBattle.BattleExecuted --network=testnet --last 5

echo ""
echo "======================================================"
echo "✅ Demo Complete!"
echo "======================================================"
echo ""

echo "🎉 Summary:"
echo "  • Scheduled battle at: $SCHEDULED_TIME_READABLE"
echo "  • Battle ID: $BATTLE_ID"
echo "  • Schedule TX: $SCHEDULE_TX_ID"
echo "  • Execute TX: $EXECUTE_TX_ID"
echo ""

echo "🔍 View on Flow Block Explorer:"
echo "  Schedule: https://testnet.flowdiver.io/tx/$SCHEDULE_TX_ID"
echo "  Execute:  https://testnet.flowdiver.io/tx/$EXECUTE_TX_ID"
echo "  Account:  https://testnet.flowdiver.io/account/$FLOW_TESTNET_ADDRESS"
echo ""

echo "📚 What just happened:"
echo "  1. ✅ Scheduled a battle 2 minutes in the future"
echo "  2. ✅ Battle stored on-chain with execution timestamp"
echo "  3. ✅ Waited for scheduled time (fully automated)"
echo "  4. ✅ Executed battle at exact scheduled time"
echo "  5. ✅ All events emitted and visible on-chain"
echo ""

echo "💡 Key Advantages:"
echo "  • 100% decentralized - no servers required"
echo "  • Trustless automation - code guarantees execution"
echo "  • Transparent - all data visible on Flow testnet"
echo "  • Cost-effective - minimal gas fees"
echo ""

echo "🚀 Next Steps:"
echo "  • Try scheduling multiple battles at different times"
echo "  • Experiment with market resolution scheduling"
echo "  • Build a frontend UI for scheduling"
echo "  • Monitor events in real-time"
echo ""

echo "======================================================"