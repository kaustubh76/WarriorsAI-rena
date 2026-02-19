export default function LeaderboardLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-yellow-950/20 to-gray-950 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Title skeleton */}
        <div className="h-10 w-56 bg-gray-800/50 rounded-lg animate-pulse mb-2"></div>
        <div className="h-5 w-80 bg-gray-800/30 rounded animate-pulse mb-8"></div>

        {/* Category tabs skeleton */}
        <div className="flex gap-3 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 w-28 bg-gray-800/40 rounded-lg animate-pulse"></div>
          ))}
        </div>

        {/* Time range tabs skeleton */}
        <div className="flex gap-2 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-8 w-20 bg-gray-800/30 rounded-full animate-pulse"></div>
          ))}
        </div>

        {/* Leaderboard rows skeleton */}
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div
              key={i}
              className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 animate-pulse flex items-center gap-4"
            >
              <div className="h-8 w-8 bg-gray-800/50 rounded-full"></div>
              <div className="flex-1">
                <div className="h-5 w-40 bg-gray-800/50 rounded mb-1"></div>
                <div className="h-3 w-24 bg-gray-800/30 rounded"></div>
              </div>
              <div className="h-6 w-24 bg-gray-800/40 rounded-lg"></div>
              <div className="h-6 w-20 bg-gray-800/30 rounded-lg"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
