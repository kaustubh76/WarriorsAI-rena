"use client"

import {getDefaultConfig} from "@rainbow-me/rainbowkit"
import {anvil, flowTestnet, flowMainnet} from "wagmi/chains"

// Use a placeholder for build time - actual project ID required at runtime
// This allows the build to succeed on Vercel, with the real ID provided via env vars
const projectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || 'build-time-placeholder';

export default getDefaultConfig({
    appName: "WarriorsAI-rena",
    projectId,
    chains: [anvil, flowTestnet, flowMainnet],
    ssr: false
})