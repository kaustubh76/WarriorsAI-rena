#!/bin/bash

# Interactive Flow Testnet Setup and Deployment Script

set -e

echo "🚀 Flow Testnet Setup & Deployment Script"
echo "=========================================="
echo ""

# Check if Flow CLI is installed
if ! command -v flow &> /dev/null; then
    echo "❌ Flow CLI not found. Installing..."
    sh -ci "$(curl -fsSL https://storage.googleapis.com/flow-cli/install.sh)"
fi

echo "✅ Flow CLI version: $(flow version | head -1)"
echo ""

# Check if .env exists
if [ ! -f "frontend/.env" ]; then
    echo "⚠️  frontend/.env not found, creating..."
    touch frontend/.env
fi

# Check if Flow testnet variables are set
if grep -q "FLOW_TESTNET_ADDRESS" frontend/.env 2>/dev/null && grep -q "FLOW_TESTNET_PRIVATE_KEY" frontend/.env 2>/dev/null; then
    echo "✅ Flow testnet credentials found in .env"

    # Extract address for verification
    FLOW_ADDRESS=$(grep "FLOW_TESTNET_ADDRESS" frontend/.env | cut -d'=' -f2)

    if [ "$FLOW_ADDRESS" != "" ] && [ "$FLOW_ADDRESS" != "0xYourAddress" ] && [ "$FLOW_ADDRESS" != "SERVICE_ACCOUNT_ADDRESS" ]; then
        echo "📍 Using testnet address: $FLOW_ADDRESS"
        echo ""

        # Verify account exists and has balance
        echo "🔍 Verifying account on Flow testnet..."
        if flow accounts get "$FLOW_ADDRESS" --network=testnet &> /dev/null; then
            echo "✅ Account verified on testnet!"

            # Show balance
            BALANCE=$(flow accounts get "$FLOW_ADDRESS" --network=testnet | grep "Balance" | awk '{print $2}')
            echo "💰 Balance: $BALANCE FLOW"
            echo ""
        else
            echo "❌ Account not found on testnet"
            echo "   Please visit: https://testnet-faucet.onflow.org/"
            echo "   And create an account with your public key"
            exit 1
        fi
    else
        echo "⚠️  FLOW_TESTNET_ADDRESS needs to be set to a real address"
        echo "   Current value: $FLOW_ADDRESS"
        echo ""
        echo "📖 Please follow these steps:"
        echo "   1. Check FLOW_ACCOUNT_CREDENTIALS.md for your keys"
        echo "   2. Visit https://testnet-faucet.onflow.org/"
        echo "   3. Create account with your public key"
        echo "   4. Update frontend/.env with your address"
        exit 1
    fi
else
    echo "⚠️  Flow testnet credentials not found in .env"
    echo ""
    echo "📖 Setup Instructions:"
    echo "   1. Open: FLOW_ACCOUNT_CREDENTIALS.md"
    echo "   2. Follow the 3-step setup process"
    echo "   3. Run this script again"
    echo ""
    exit 1
fi

# Check flow.json configuration
echo "🔍 Checking flow.json configuration..."
if grep -q "SERVICE_ACCOUNT_ADDRESS" flow.json 2>/dev/null; then
    echo "⚠️  flow.json still has placeholder address"
    echo "   Updating flow.json with your address..."

    # Update flow.json with actual address
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/SERVICE_ACCOUNT_ADDRESS/$FLOW_ADDRESS/g" flow.json
    else
        # Linux
        sed -i "s/SERVICE_ACCOUNT_ADDRESS/$FLOW_ADDRESS/g" flow.json
    fi

    echo "✅ flow.json updated"
else
    echo "✅ flow.json already configured"
fi

echo ""
echo "=========================================="
echo "🚀 Ready to Deploy Cadence Contracts"
echo "=========================================="
echo ""
echo "The following contracts will be deployed:"
echo "  1. ScheduledBattle.cdc"
echo "  2. ScheduledMarketResolver.cdc"
echo "  3. EVMBridge.cdc"
echo ""

read -p "Do you want to proceed with deployment? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 0
fi

echo ""
echo "🚀 Starting deployment..."
echo ""

# Deploy ScheduledBattle
echo "📝 Deploying ScheduledBattle contract..."
if flow accounts add-contract ScheduledBattle ./cadence/contracts/ScheduledBattle.cdc --network=testnet --signer=testnet-account; then
    echo "✅ ScheduledBattle deployed successfully!"
else
    echo "❌ Failed to deploy ScheduledBattle"
    echo "   This might be because the contract already exists."
    echo "   If you need to update it, use: flow accounts update-contract"
fi

echo ""

# Deploy ScheduledMarketResolver
echo "📝 Deploying ScheduledMarketResolver contract..."
if flow accounts add-contract ScheduledMarketResolver ./cadence/contracts/ScheduledMarketResolver.cdc --network=testnet --signer=testnet-account; then
    echo "✅ ScheduledMarketResolver deployed successfully!"
else
    echo "❌ Failed to deploy ScheduledMarketResolver"
    echo "   This might be because the contract already exists."
fi

echo ""

# Deploy EVMBridge
echo "📝 Deploying EVMBridge contract..."
if flow accounts add-contract EVMBridge ./cadence/contracts/EVMBridge.cdc --network=testnet --signer=testnet-account; then
    echo "✅ EVMBridge deployed successfully!"
else
    echo "❌ Failed to deploy EVMBridge"
    echo "   This might be because the contract already exists."
fi

echo ""
echo "=========================================="
echo "✅ Deployment Complete!"
echo "=========================================="
echo ""

# List deployed contracts
echo "📋 Deployed contracts:"
flow accounts contracts list "$FLOW_ADDRESS" --network=testnet

echo ""
echo "🎉 Next Steps:"
echo "   1. Test scheduled transactions: ./scripts/test-cadence-scheduled.sh"
echo "   2. Schedule a battle: See QUICK_START.md"
echo "   3. Monitor events on: https://testnet.flowdiver.io/account/$FLOW_ADDRESS"
echo ""
echo "📚 Documentation:"
echo "   - QUICK_START.md - Test everything"
echo "   - CADENCE_TESTING_GUIDE.md - Comprehensive testing"
echo "   - TEST_REPORT.md - API test results"
echo ""
