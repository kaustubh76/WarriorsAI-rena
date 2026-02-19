export default function PortfolioLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-green-950/20 to-gray-950 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Title skeleton */}
        <div className="h-10 w-44 bg-gray-800/50 rounded-lg animate-pulse mb-2"></div>
        <div className="h-5 w-64 bg-gray-800/30 rounded animate-pulse mb-8"></div>

        {/* Portfolio summary cards skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 animate-pulse">
              <div className="h-4 w-24 bg-gray-800/30 rounded mb-3"></div>
              <div className="h-8 w-32 bg-gray-800/50 rounded mb-1"></div>
              <div className="h-3 w-16 bg-gray-800/20 rounded"></div>
            </div>
          ))}
        </div>

        {/* Chart skeleton */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 mb-8 animate-pulse">
          <div className="h-5 w-40 bg-gray-800/40 rounded mb-4"></div>
          <div className="h-48 bg-gray-800/20 rounded-lg"></div>
        </div>

        {/* Positions list skeleton */}
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 animate-pulse flex items-center gap-4"
            >
              <div className="flex-1">
                <div className="h-5 w-48 bg-gray-800/50 rounded mb-2"></div>
                <div className="h-3 w-32 bg-gray-800/30 rounded"></div>
              </div>
              <div className="h-6 w-20 bg-gray-800/40 rounded-lg"></div>
              <div className="h-6 w-24 bg-gray-800/30 rounded-lg"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
