import { UVData } from '@/lib/noaa'

interface Band {
  max: number
  label: string
  advice: string
  color: string
  bg: string
}

const BANDS: Band[] = [
  { max: 2,   label: 'Low',       advice: 'No protection needed',           color: 'text-emerald-400', bg: 'bg-emerald-500' },
  { max: 5,   label: 'Moderate',  advice: 'Seek shade midday',              color: 'text-yellow-400',  bg: 'bg-yellow-500'  },
  { max: 7,   label: 'High',      advice: 'SPF 30+, cover up',              color: 'text-orange-400',  bg: 'bg-orange-500'  },
  { max: 10,  label: 'Very High', advice: 'SPF 50+, limit midday exposure', color: 'text-red-400',     bg: 'bg-red-500'     },
  { max: Infinity, label: 'Extreme', advice: 'Avoid midday sun',            color: 'text-purple-400',  bg: 'bg-purple-500'  },
]

function getBand(index: number): Band {
  return BANDS.find(b => index <= b.max) ?? BANDS[BANDS.length - 1]
}

export default function UVIndex({ uv }: { uv: UVData }) {
  if (uv.error) {
    return (
      <div className="bg-slate-800 rounded-2xl p-5 shadow-lg">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">🌤️</span>
          <h3 className="text-white font-bold text-lg">UV Index</h3>
        </div>
        <p className="text-red-400 text-sm">Unavailable: {uv.error}</p>
      </div>
    )
  }

  const band = getBand(uv.uvIndex)
  const barWidth = Math.min((uv.uvIndex / 11) * 100, 100)

  return (
    <div className="bg-slate-800 rounded-2xl p-5 shadow-lg">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">🌤️</span>
        <div>
          <h3 className="text-white font-bold text-lg">UV Index</h3>
          <p className="text-slate-400 text-sm">West Palm Beach · {uv.date}</p>
        </div>
      </div>

      <div className="flex items-end gap-3 mb-4">
        <span className={`text-5xl font-bold ${band.color}`}>{uv.uvIndex}</span>
        <div className="mb-1">
          <p className={`font-semibold text-lg ${band.color}`}>{band.label}</p>
          {uv.uvAlert && (
            <span className="text-xs bg-red-900 text-red-300 px-2 py-0.5 rounded-full font-medium">UV Alert</span>
          )}
        </div>
        {uv.uvIndexTomorrow > 0 && (
          <div className="mb-1 ml-auto text-right">
            <p className="text-xs text-slate-500">Tomorrow</p>
            <p className={`font-bold text-lg ${getBand(uv.uvIndexTomorrow).color}`}>{uv.uvIndexTomorrow}</p>
          </div>
        )}
      </div>

      {/* Scale bar */}
      <div className="mb-3">
        <div className="h-2 w-full bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${band.bg}`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-600 mt-1">
          <span>0</span><span>3</span><span>6</span><span>8</span><span>11+</span>
        </div>
      </div>

      <p className="text-slate-400 text-sm">{band.advice}</p>

      {(() => {
        const daytime = uv.hourly.filter(h => h.value > 0)
        if (daytime.length === 0) return null
        return (
          <div className="mt-4">
            <p className="text-xs text-slate-500 mb-1">Hourly forecast</p>
            {/* bars — fixed pixel heights so they render correctly in flex */}
            <div className="flex items-end gap-0.5 mb-1" style={{ height: '40px' }}>
              {daytime.map(({ hour, value }) => {
                const b = getBand(value)
                const h = Math.max(Math.round((value / 11) * 38), 2)
                return (
                  <div
                    key={hour}
                    className={`flex-1 rounded-sm ${b.bg} opacity-80`}
                    style={{ height: `${h}px` }}
                    title={`${hour}: UV ${value}`}
                  />
                )
              })}
            </div>
            {/* labels */}
            <div className="flex gap-0.5">
              {daytime.map(({ hour }) => (
                <div key={hour} className="flex-1 text-center text-[8px] text-slate-600 leading-none truncate">{hour}</div>
              ))}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
