'use client'

import { TideData } from '@/lib/noaa'

function formatTime(timeStr: string): string {
  const date = new Date(timeStr)
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function formatDate(timeStr: string): string {
  const date = new Date(timeStr)
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function TidePanel({ tides }: { tides: TideData }) {
  const today = new Date().toDateString()
  const todayPredictions = tides.predictions.filter(p => new Date(p.time).toDateString() === today)
  const tomorrowPredictions = tides.predictions.filter(p => new Date(p.time).toDateString() !== today)

  return (
    <div className="bg-slate-800 rounded-2xl p-5 shadow-lg">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">🌊</span>
        <div>
          <h3 className="text-white font-bold text-lg">Tide Predictions</h3>
          <p className="text-slate-400 text-sm">Lake Worth Inlet (Station 8722588)</p>
        </div>
      </div>

      {tides.error ? (
        <p className="text-red-400 text-sm">Tide data unavailable: {tides.error}</p>
      ) : (
        <div className="space-y-4">
          {[{ label: 'Today', data: todayPredictions }, { label: 'Tomorrow', data: tomorrowPredictions }].map(
            ({ label, data }) =>
              data.length > 0 && (
                <div key={label}>
                  <p className="text-cyan-400 text-xs uppercase tracking-wider font-medium mb-2">{label}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {data.map((p, i) => (
                      <div key={i} className="flex items-center justify-between bg-slate-700 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-lg ${p.type === 'H' ? 'text-blue-400' : 'text-orange-400'}`}>
                            {p.type === 'H' ? '▲' : '▼'}
                          </span>
                          <div>
                            <p className="text-white text-sm font-medium">{formatTime(p.time)}</p>
                            <p className="text-slate-400 text-xs">{p.type === 'H' ? 'High' : 'Low'}</p>
                          </div>
                        </div>
                        <span className="text-white font-bold text-sm">{p.height} ft</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
          )}
          {tides.predictions.length === 0 && (
            <p className="text-slate-400 text-sm">No predictions available.</p>
          )}
        </div>
      )}
    </div>
  )
}
