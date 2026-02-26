import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 via-red-950/20 to-gray-950">
      <div className="text-center px-6">
        <div className="text-8xl mb-6">&#x2694;&#xFE0F;</div>
        <h1
          className="text-4xl sm:text-5xl md:text-6xl text-red-400 mb-4 tracking-widest"
          style={{ fontFamily: "Press Start 2P, monospace" }}
        >
          404
        </h1>
        <h2
          className="text-sm sm:text-base md:text-xl text-yellow-400 mb-8 tracking-wider"
          style={{ fontFamily: "Press Start 2P, monospace" }}
        >
          WARRIOR LOST IN THE VOID
        </h2>
        <p className="text-gray-400 mb-10 max-w-md mx-auto">
          The path you seek does not exist. Return to the arena and choose your
          destiny.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
          <Link
            href="/"
            className="px-6 sm:px-8 py-3 bg-red-600/30 hover:bg-red-600/50 border-2 border-red-500/50 text-red-300 rounded-lg transition-all hover:border-red-400 text-center"
            style={{ fontFamily: "Press Start 2P, monospace", fontSize: "0.75rem" }}
          >
            RETURN HOME
          </Link>
          <Link
            href="/arena"
            className="px-6 sm:px-8 py-3 bg-yellow-600/20 hover:bg-yellow-600/30 border-2 border-yellow-500/50 text-yellow-300 rounded-lg transition-all hover:border-yellow-400 text-center"
            style={{ fontFamily: "Press Start 2P, monospace", fontSize: "0.75rem" }}
          >
            ENTER ARENA
          </Link>
        </div>
      </div>
    </div>
  );
}
