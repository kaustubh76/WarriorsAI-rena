#!/bin/bash

# Cadence Contract Deployment Script
# Deploys ScheduledBattle, ScheduledMarketResolver, and EVMBridge contracts to Flow testnet

set -e

echo "🚀 Starting Cadence contract deployment to Flow testnet..."

# Check if Flow CLI is installed
if ! command -v flow &> /dev/null; then
    echo "❌ Flow CLI not found. Installing..."
    sh -ci "$(curl -fsSL https://storage.googleapis.com/flow-cli/install.sh)"
fi

# Check environment variables
if [ -z "$FLOW_TESTNET_PRIVATE_KEY" ]; then
    echo "❌ FLOW_TESTNET_PRIVATE_KEY environment variable not set"
    echo "   Please set it in your .env file or export it"
    exit 1
fi

if [ -z "$FLOW_TESTNET_ADDRESS" ]; then
    echo "❌ FLOW_TESTNET_ADDRESS environment variable not set"
    echo "   Please set it in your .env file or export it"
    exit 1
fi

echo "📋 Deployment Configuration:"
echo "   Network: Flow Testnet"
echo "   Address: $FLOW_TESTNET_ADDRESS"
echo "   Contracts: ScheduledBattle, ScheduledMarketResolver, EVMBridge"
echo ""

# Navigate to project root
cd "$(dirname "$0")/.."

# Deploy contracts
echo "1️⃣  Deploying ScheduledBattle contract..."
flow accounts add-contract ScheduledBattle \
  ./cadence/contracts/ScheduledBattle.cdc \
  --network=testnet \
  --signer=testnet-account

echo "✅ ScheduledBattle deployed"

echo "2️⃣  Deploying ScheduledMarketResolver contract..."
flow accounts add-contract ScheduledMarketResolver \
  ./cadence/contracts/ScheduledMarketResolver.cdc \
  --network=testnet \
  --signer=testnet-account

echo "✅ ScheduledMarketResolver deployed"

echo "3️⃣  Deploying EVMBridge contract..."
flow accounts add-contract EVMBridge \
  ./cadence/contracts/EVMBridge.cdc \
  --network=testnet \
  --signer=testnet-account

echo "✅ EVMBridge deployed"

echo ""
echo "🎉 All contracts deployed successfully!"
echo ""
echo "📝 Next steps:"
echo "   1. Test the contracts: npm run test:cadence"
echo "   2. Schedule a test battle: npm run schedule:battle"
echo "   3. Monitor events: npm run monitor:events"
echo ""
