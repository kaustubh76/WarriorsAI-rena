export default function AIAgentsLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-blue-950/20 to-gray-950 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Title skeleton */}
        <div className="h-10 w-48 bg-gray-800/50 rounded-lg animate-pulse mb-2"></div>
        <div className="h-5 w-72 bg-gray-800/30 rounded animate-pulse mb-8"></div>

        {/* Stats bar skeleton */}
        <div className="flex gap-4 mb-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 flex-1 animate-pulse">
              <div className="h-4 w-20 bg-gray-800/30 rounded mb-2"></div>
              <div className="h-7 w-16 bg-gray-800/50 rounded"></div>
            </div>
          ))}
        </div>

        {/* Search and filter skeleton */}
        <div className="flex gap-3 mb-6">
          <div className="h-10 flex-1 bg-gray-800/30 rounded-lg animate-pulse"></div>
          <div className="h-10 w-32 bg-gray-800/40 rounded-lg animate-pulse"></div>
        </div>

        {/* Agent cards grid skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 animate-pulse"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 bg-gray-800/50 rounded-full"></div>
                <div className="flex-1">
                  <div className="h-5 w-2/3 bg-gray-800/50 rounded mb-2"></div>
                  <div className="h-3 w-1/3 bg-gray-800/30 rounded"></div>
                </div>
              </div>
              <div className="h-4 w-full bg-gray-800/30 rounded mb-2"></div>
              <div className="h-4 w-3/4 bg-gray-800/30 rounded mb-4"></div>
              <div className="grid grid-cols-3 gap-3">
                <div className="h-12 bg-gray-800/30 rounded-lg"></div>
                <div className="h-12 bg-gray-800/30 rounded-lg"></div>
                <div className="h-12 bg-gray-800/30 rounded-lg"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
