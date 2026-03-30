import { CurrentData } from '@/lib/noaa'

// CO-OPS returns "YYYY-MM-DD HH:MM" already in Eastern Time
function fmtCurrentTime(timeStr: string): string {
  const [, t] = timeStr.split(' ')
  const [h, m] = t.split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${ap} ET`
}

function speedLabel(knots: string): { label: string; color: string } {
  const s = parseFloat(knots)
  if (isNaN(s)) return { label: 'Unknown', color: 'text-slate-500' }
  if (s < 0.3)  return { label: 'Slack',    color: 'text-emerald-400' }
  if (s < 0.75) return { label: 'Light',    color: 'text-cyan-400'    }
  if (s < 1.5)  return { label: 'Moderate', color: 'text-yellow-400'  }
  return             { label: 'Strong',    color: 'text-red-400'     }
}

export default function CurrentPanel({ current }: { current: CurrentData }) {
  const { label, color } = current.error ? { label: '—', color: 'text-slate-500' } : speedLabel(current.speed)

  return (
    <div className="bg-slate-800 rounded-2xl p-5 shadow-lg">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">🌊</span>
        <div>
          <h3 className="text-white font-bold text-lg">Tidal Current</h3>
          <p className="text-slate-400 text-sm">{current.name} (NOAA PORTS)</p>
        </div>
      </div>

      {current.error ? (
        <p className="text-red-400 text-sm">Unavailable: {current.error}</p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between bg-slate-700 rounded-lg px-3 py-2">
            <span className="text-slate-400 text-sm">Speed</span>
            <div className="text-right">
              <span className="text-white font-bold">{current.speed} kt</span>
              <span className={`text-xs ml-2 font-medium ${color}`}>{label}</span>
            </div>
          </div>
          <div className="flex items-center justify-between bg-slate-700 rounded-lg px-3 py-2">
            <span className="text-slate-400 text-sm">Direction</span>
            <span className="text-white font-medium">{current.direction}</span>
          </div>
          <div className="flex items-center justify-between bg-slate-700 rounded-lg px-3 py-2">
            <span className="text-slate-400 text-sm">Updated</span>
            <span className="text-slate-400 text-xs">
              {current.updated ? fmtCurrentTime(current.updated) : '—'}
            </span>
          </div>
          <p className="text-xs text-slate-600 pt-1">
            Live observation · not a prediction · reflects inlet current, not offshore
          </p>
        </div>
      )}
    </div>
  )
}
