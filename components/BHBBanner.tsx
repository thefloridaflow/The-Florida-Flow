export default function BHBBanner() {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div>
        <p className="text-cyan-400 text-xs uppercase tracking-wider font-medium mb-1">BHB Site Guide</p>
        <p className="text-white font-semibold text-base">First time at BHB?</p>
        <p className="text-slate-400 text-sm mt-1">
          The Florida Flow BHB Site Guide covers tide strategy, marine life, best entry points, and what to expect underwater.{' '}
          <span className="text-white font-semibold">$12</span>
        </p>
      </div>
      <a
        href="https://ko-fi.com/s/59604a0ac1"
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
      >
        Get the Guide →
      </a>
    </div>
  )
}
