export default function ArbitrageLoading() {
  return (
    <div className="min-h-screen bg-gray-950 p-4 sm:p-8 animate-pulse">
      <div className="max-w-5xl mx-auto">
        <div className="h-10 w-64 bg-gray-800 rounded mb-6" />
        <div className="h-12 w-full bg-gray-800/30 rounded-lg mb-6" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-gray-800/50 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
