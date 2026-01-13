"use client"

import {QueryClient, QueryClientProvider} from "@tanstack/react-query"
import {type ReactNode, useMemo, useRef} from "react"
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

    useEffect(() => {
        setMounted(true)
    }, [])

    return (
        <WagmiProvider config={config} reconnectOnMount={false}>
            <QueryClientProvider client={queryClientRef.current}>
                <RainbowKitProvider>
                    <EncryptionCacheManager>
                        {mounted ? props.children : null}
                    </EncryptionCacheManager>
                </RainbowKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    )
}