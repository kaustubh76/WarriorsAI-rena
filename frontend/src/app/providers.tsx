"use client"

import {QueryClient, QueryClientProvider} from "@tanstack/react-query"
import {type ReactNode, useRef} from "react"
import {getConfig} from "@/rainbowKitConfig"
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
    // Use refs to ensure single initialization across React StrictMode double-mounts
    const queryClientRef = useRef<QueryClient | null>(null)
    if (!queryClientRef.current) {
        queryClientRef.current = new QueryClient({
            defaultOptions: {
                queries: {
                    staleTime: 5000,
                    refetchOnWindowFocus: false,
                },
            },
        })
    }

    const [mounted, setMounted] = useState(false)

    // Get wagmi config lazily on client side only
    const wagmiConfig = typeof window !== 'undefined' ? getConfig() : null

    useEffect(() => {
        setMounted(true)
    }, [])

    // Don't render WagmiProvider until we're on the client and have a config
    if (!mounted || !wagmiConfig) {
        return (
            <QueryClientProvider client={queryClientRef.current}>
                {null}
            </QueryClientProvider>
        )
    }

    return (
        <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
            <QueryClientProvider client={queryClientRef.current}>
                <RainbowKitProvider>
                    <EncryptionCacheManager>
                        {props.children}
                    </EncryptionCacheManager>
                </RainbowKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    )
}