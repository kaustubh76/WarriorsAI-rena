#!/bin/bash
set -e

echo "🔧 Setting up Flow Testnet Account..."
echo ""

# Check if Flow CLI is installed
if ! command -v flow &> /dev/null; then
    echo "❌ Flow CLI not found. Please install it first:"
    echo "   brew install flow-cli"
    exit 1
fi

# Configuration
PRIVATE_KEY="c6354f2a405a24b97b0afefd1374d1ba490f3db8944217f8d53387cc9fdecaa2"

echo "📝 Using existing private key from .env.local"
echo ""

# Generate public key from private key
echo "🔑 Deriving public key..."
PUBLIC_KEY=$(flow keys decode rlp $PRIVATE_KEY 2>&1 | grep "Public Key" | awk '{print $3}' || echo "")

if [ -z "$PUBLIC_KEY" ]; then
    echo "⚠️  Could not derive public key automatically"
    echo ""
    echo "📋 Manual Steps Required:"
    echo "1. Visit: https://testnet-faucet.onflow.org/"
    echo "2. Click 'Create Account'"
    echo "3. Save the Flow address (format: 0x1234567890abcdef)"
    echo "4. Update flow.json testnet-account address"
    echo "5. Keep the same private key: $PRIVATE_KEY"
    echo ""
    echo "🎯 Once you have the testnet address, run:"
    echo "   flow project deploy --network testnet"
else
    echo "✅ Public Key: $PUBLIC_KEY"
    echo ""
    echo "📋 Next steps:"
    echo "1. Use this public key at testnet faucet"
    echo "2. Or fund an existing account"
fi

echo ""
echo "🌐 Flow Testnet Faucet: https://testnet-faucet.onflow.org/"
echo ""
