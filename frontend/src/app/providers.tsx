"use client"

import {QueryClient, QueryClientProvider} from "@tanstack/react-query"
import {type ReactNode} from "react"
import config from "@/rainbowKitConfig"
import {WagmiProvider} from "wagmi"
import {RainbowKitProvider} from "@rainbow-me/rainbowkit"
import {useState, useEffect} from "react"
import "@rainbow-me/rainbowkit/styles.css"
import {useEncryptionCacheManager} from "@/hooks/useEncryptionCacheManager"

// Inner component that can use wagmi hooks (must be inside WagmiProvider)
function EncryptionCacheManager({children}: {children: ReactNode}) {
    useEncryptionCacheManager()
    return <>{children}</>
}

export function Providers(props: {children: ReactNode}) {
    const [queryClient] = useState(() => new QueryClient())
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
                <RainbowKitProvider>
                    <EncryptionCacheManager>
                        {mounted ? props.children : null}
                    </EncryptionCacheManager>
                </RainbowKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    )
}