export default function WhaleTrackerLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-cyan-950/20 to-gray-950 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Title skeleton */}
        <div className="h-10 w-52 bg-gray-800/50 rounded-lg animate-pulse mb-2"></div>
        <div className="h-5 w-80 bg-gray-800/30 rounded animate-pulse mb-8"></div>

        {/* Stats cards skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 animate-pulse">
              <div className="h-4 w-28 bg-gray-800/30 rounded mb-3"></div>
              <div className="h-8 w-20 bg-gray-800/50 rounded"></div>
            </div>
          ))}
        </div>

        {/* Whale entries skeleton */}
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 animate-pulse flex items-center gap-4"
            >
              <div className="h-10 w-10 bg-gray-800/50 rounded-full"></div>
              <div className="flex-1">
                <div className="h-5 w-36 bg-gray-800/50 rounded mb-2"></div>
                <div className="h-3 w-56 bg-gray-800/30 rounded"></div>
              </div>
              <div className="h-6 w-24 bg-gray-800/40 rounded-lg"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
