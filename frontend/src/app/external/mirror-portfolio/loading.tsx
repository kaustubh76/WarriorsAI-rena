export default function MirrorPortfolioLoading() {
  return (
    <div className="min-h-screen bg-gray-950 p-4 sm:p-8 animate-pulse">
      <div className="max-w-5xl mx-auto">
        <div className="h-10 w-56 bg-gray-800 rounded mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-800/50 rounded-xl" />
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-gray-800/50 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
