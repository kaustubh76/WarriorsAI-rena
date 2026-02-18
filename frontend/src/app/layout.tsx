import type { Metadata } from "next";
import "./globals.css";
import {ReactNode} from "react";
import {Providers} from "./providers";
import Header from "../components/Header";
import Footer from "@/components/Footer";
import WarriorAssistant from "@/components/WarriorAssistant";
import { WarriorMessageProvider } from "@/contexts/WarriorMessageContext";
import { TestModeProvider } from "@/contexts/TestModeContext";
import { TestModeBanner } from "@/components/0g/TestModeBanner";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { GamificationProvider } from "@/contexts/GamificationContext";
import { ToastContainer } from "@/components/gamification/ToastContainer";
import { GamificationOverlay } from "@/components/gamification/GamificationOverlay";
import { validateEnvironmentOrThrow } from "@/lib/validateEnv";

// Validate environment variables on server startup (runtime only, not during build)
// Skip validation during Next.js build phase to allow CI builds without full env
if (typeof window === 'undefined' && process.env.NEXT_PHASE !== 'phase-production-build') {
  validateEnvironmentOrThrow({ checkSensitive: false });
}

export const metadata: Metadata = {
  title: {
    default: "WarriorsAI-rena | AI Battle Arena & Prediction Markets",
    template: "%s | WarriorsAI-rena",
  },
  description:
    "AI-powered blockchain battle arena with prediction markets on Flow. Mint warrior NFTs, compete in AI battles, trade on mirrored Polymarket & Kalshi markets, and earn CRwN tokens.",
  keywords: [
    "AI battle arena",
    "prediction markets",
    "Flow blockchain",
    "NFT warriors",
    "DeFi",
    "Polymarket",
    "Kalshi",
    "CRwN token",
  ],
  openGraph: {
    title: "WarriorsAI-rena | AI Battle Arena & Prediction Markets",
    description:
      "Mint warrior NFTs, compete in AI-powered battles, and trade prediction markets on Flow blockchain.",
    url: "https://frontend-one-sandy-18.vercel.app",
    siteName: "WarriorsAI-rena",
    images: [
      {
        url: "/Arena_landing.png",
        width: 1200,
        height: 630,
        alt: "WarriorsAI-rena Battle Arena",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "WarriorsAI-rena | AI Battle Arena & Prediction Markets",
    description:
      "Mint warrior NFTs, compete in AI battles, and trade prediction markets on Flow.",
    images: ["/Arena_landing.png"],
  },
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_BASE_URL || "https://frontend-one-sandy-18.vercel.app"
  ),
};

export default function RootLayout(props: {children: ReactNode}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/warrior/Warrior_Idle_1.png" type="image/png" />
      </head>
      <body suppressHydrationWarning>
        <Providers>
          <TestModeProvider>
            <NotificationProvider>
              <GamificationProvider>
                <WarriorMessageProvider>
                  <Header />
                  <TestModeBanner />
                  {props.children}
                  <Footer />
                  <WarriorAssistant />
                  <ToastContainer />
                  <GamificationOverlay />
                </WarriorMessageProvider>
              </GamificationProvider>
            </NotificationProvider>
          </TestModeProvider>
        </Providers>
      </body>
    </html>
  );
}
