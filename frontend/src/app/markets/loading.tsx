export default function MarketsLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950/20 to-gray-950 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Title skeleton */}
        <div className="h-10 w-72 bg-gray-800/50 rounded-lg animate-pulse mb-4"></div>
        <div className="h-5 w-96 bg-gray-800/30 rounded animate-pulse mb-8"></div>

        {/* Filter bar skeleton */}
        <div className="flex gap-3 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-9 w-24 bg-gray-800/40 rounded-lg animate-pulse"></div>
          ))}
        </div>

        {/* Market cards skeleton */}
        <div className="grid gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 animate-pulse"
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <div className="h-5 w-3/4 bg-gray-800/50 rounded mb-2"></div>
                  <div className="h-4 w-1/2 bg-gray-800/30 rounded"></div>
                </div>
                <div className="h-8 w-20 bg-gray-800/40 rounded-lg"></div>
              </div>
              <div className="flex gap-4 mt-4">
                <div className="h-3 w-24 bg-gray-800/30 rounded"></div>
                <div className="h-3 w-24 bg-gray-800/30 rounded"></div>
                <div className="h-3 w-24 bg-gray-800/30 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
