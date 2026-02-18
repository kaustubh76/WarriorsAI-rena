export default function ArenaLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-red-950/20 to-gray-950 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Title skeleton */}
        <div className="h-10 w-64 bg-gray-800/50 rounded-lg animate-pulse mb-8"></div>

        {/* Arena cards skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 animate-pulse"
            >
              <div className="h-6 w-48 bg-gray-800/50 rounded mb-4"></div>
              <div className="h-4 w-full bg-gray-800/30 rounded mb-2"></div>
              <div className="h-4 w-3/4 bg-gray-800/30 rounded mb-4"></div>
              <div className="flex gap-3">
                <div className="h-10 flex-1 bg-gray-800/40 rounded-lg"></div>
                <div className="h-10 flex-1 bg-gray-800/40 rounded-lg"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
