export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 via-purple-950/20 to-gray-950">
      <div className="text-center">
        <div className="relative w-16 h-16 mx-auto mb-6">
          <div className="absolute inset-0 rounded-full border-4 border-yellow-500/20"></div>
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-yellow-500 animate-spin"></div>
        </div>
        <p
          className="text-yellow-400 text-sm tracking-wider animate-pulse"
          style={{ fontFamily: "Press Start 2P, monospace" }}
        >
          LOADING...
        </p>
      </div>
    </div>
  );
}
