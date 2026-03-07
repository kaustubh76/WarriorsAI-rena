export default function AgentDetailLoading() {
  return (
    <div className="min-h-screen bg-gray-950 p-4 sm:p-8 animate-pulse">
      <div className="max-w-4xl mx-auto">
        <div className="h-6 w-32 bg-gray-800 rounded mb-6" />
        <div className="h-10 w-64 bg-gray-800 rounded mb-4" />
        <div className="h-4 w-96 bg-gray-800/60 rounded mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-gray-800/50 rounded-xl" />
          ))}
        </div>
        <div className="h-64 bg-gray-800/50 rounded-xl" />
      </div>
    </div>
  );
}
