"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[WarriorsAI-rena] Unhandled error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 via-red-950/20 to-gray-950">
      <div className="text-center px-6 max-w-lg">
        <div className="text-7xl mb-6">&#x1F4A5;</div>
        <h1
          className="text-3xl text-red-400 mb-4 tracking-wider"
          style={{ fontFamily: "Press Start 2P, monospace" }}
        >
          CRITICAL HIT!
        </h1>
        <p className="text-gray-400 mb-8">
          Something went wrong. The arena encountered an unexpected error.
        </p>
        {error.digest && (
          <p className="text-gray-600 text-xs mb-6 font-mono">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex gap-4 justify-center">
          <button
            onClick={reset}
            className="px-8 py-3 bg-yellow-600/20 hover:bg-yellow-600/30 border-2 border-yellow-500/50 text-yellow-300 rounded-lg transition-all hover:border-yellow-400"
            style={{ fontFamily: "Press Start 2P, monospace", fontSize: "0.7rem" }}
          >
            TRY AGAIN
          </button>
          <a
            href="/"
            className="px-8 py-3 bg-red-600/30 hover:bg-red-600/50 border-2 border-red-500/50 text-red-300 rounded-lg transition-all hover:border-red-400"
            style={{ fontFamily: "Press Start 2P, monospace", fontSize: "0.7rem" }}
          >
            RETURN HOME
          </a>
        </div>
      </div>
    </div>
  );
}
