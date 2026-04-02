export default function BHBGuideCard() {
  return (
    <div className="bg-slate-800 rounded-2xl border-l-4 border-cyan-500 p-5 shadow-lg flex flex-col">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-white font-bold text-lg leading-tight">BHB Site Guide</h3>
          <p className="text-slate-400 text-sm">Blue Heron Bridge, Palm Beach</p>
        </div>
        <span className="text-xs bg-cyan-900/60 text-cyan-300 px-2 py-1 rounded-full font-semibold tracking-wide">
          GUIDE
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {[
          { icon: '🌊', label: 'Tide Windows', detail: 'Optimal entry times' },
          { icon: '🐠', label: 'Marine Life', detail: 'Species by season' },
          { icon: '🤿', label: 'Entry Points', detail: 'Best spots & access' },
          { icon: '📍', label: 'Site Map', detail: 'Navigation & depth' },
        ].map(({ icon, label, detail }) => (
          <div key={label} className="flex flex-col">
            <span className="text-xs text-cyan-400 uppercase tracking-wider font-medium">{icon} {label}</span>
            <span className="text-sm text-slate-300 mt-0.5">{detail}</span>
          </div>
        ))}
      </div>

      <div className="mt-auto pt-3 border-t border-slate-700 flex items-center justify-between">
        <p className="text-xs text-slate-500">Issue 01 · PDF download</p>
        <a
          href="https://ko-fi.com/s/59604a0ac1"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs bg-cyan-600 hover:bg-cyan-500 text-white font-semibold px-3 py-1.5 rounded-lg transition-colors"
        >
          Get the Guide — $12 →
        </a>
      </div>
    </div>
  )
}
