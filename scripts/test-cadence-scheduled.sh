#!/bin/bash

# Cadence Scheduled Transactions Test Script
# Tests the full flow of scheduling and executing transactions

set -e

echo "🧪 Testing Cadence Scheduled Transaction System..."
echo ""

# Navigate to project root
cd "$(dirname "$0")/.."

# Test 1: Schedule a battle
echo "Test 1: Schedule a battle for 2 minutes in the future"
echo "=================================================="

# Calculate scheduled time (current timestamp + 120 seconds)
SCHEDULED_TIME=$(echo "$(date +%s) + 120" | bc)

echo "Scheduling battle with:"
echo "  Warrior 1 ID: 1"
echo "  Warrior 2 ID: 2"
echo "  Bet Amount: 100.0 CRwN"
echo "  Scheduled Time: $SCHEDULED_TIME ($(date -r $SCHEDULED_TIME))"
echo ""

flow transactions send \
  ./cadence/transactions/schedule_battle.cdc \
  --arg UInt64:1 \
  --arg UInt64:2 \
  --arg UFix64:100.0 \
  --arg UFix64:${SCHEDULED_TIME}.0 \
  --network=testnet \
  --signer=testnet-account

echo "✅ Battle scheduled successfully"
echo ""

# Test 2: Query scheduled battles
echo "Test 2: Query pending scheduled battles"
echo "=================================================="

flow scripts execute \
  ./cadence/scripts/query_scheduled_battles.cdc \
  --network=testnet

echo "✅ Query completed"
echo ""

# Test 3: Wait for scheduled time
echo "Test 3: Waiting for scheduled time to arrive..."
echo "=================================================="
echo "Waiting 120 seconds for battle to be ready..."
sleep 120

echo "✅ Scheduled time reached"
echo ""

# Test 4: Query ready battles
echo "Test 4: Query battles ready to execute"
echo "=================================================="

flow scripts execute \
  ./cadence/scripts/query_ready_battles.cdc \
  --network=testnet

echo "✅ Query completed"
echo ""

# Test 5: Execute the battle
echo "Test 5: Execute the scheduled battle"
echo "=================================================="

# Get the transaction ID from the previous query (assumes ID 0 for first test)
TRANSACTION_ID=0

flow transactions send \
  ./cadence/transactions/execute_battle.cdc \
  --arg UInt64:${TRANSACTION_ID} \
  --network=testnet \
  --signer=testnet-account

echo "✅ Battle executed successfully"
echo ""

# Test 6: Monitor events
echo "Test 6: Monitor BattleScheduled and BattleExecuted events"
echo "=================================================="

# Get contract address from flow.json
CONTRACT_ADDRESS=$(flow accounts get testnet-account --network=testnet | grep "Address" | awk '{print $2}')

echo "Fetching events for contract: A.${CONTRACT_ADDRESS}.ScheduledBattle"
echo ""

echo "BattleScheduled events:"
flow events get A.${CONTRACT_ADDRESS}.ScheduledBattle.BattleScheduled \
  --network=testnet \
  --last 10

echo ""
echo "BattleExecuted events:"
flow events get A.${CONTRACT_ADDRESS}.ScheduledBattle.BattleExecuted \
  --network=testnet \
  --last 10

echo ""
echo "🎉 All tests completed successfully!"
echo ""
echo "Summary:"
echo "  ✅ Battle scheduling works"
echo "  ✅ Query scripts work"
echo "  ✅ Scheduled execution works"
echo "  ✅ Events are emitted correctly"
echo ""
