export default function MarketDetailLoading() {
  return (
    <div className="min-h-screen bg-gray-950 p-4 sm:p-8 animate-pulse">
      <div className="max-w-5xl mx-auto">
        <div className="h-6 w-32 bg-gray-800 rounded mb-6" />
        <div className="h-8 w-3/4 bg-gray-800 rounded mb-4" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="h-64 bg-gray-800/50 rounded-xl" />
            <div className="h-48 bg-gray-800/50 rounded-xl" />
          </div>
          <div className="space-y-4">
            <div className="h-72 bg-gray-800/50 rounded-xl" />
            <div className="h-40 bg-gray-800/50 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
