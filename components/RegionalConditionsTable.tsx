import { BuoyData } from '@/lib/noaa'

const REGIONS: { name: string; buoyId: string }[] = [
  { name: 'Space Coast',              buoyId: '41009'  },
  { name: 'Jupiter / Tequesta',       buoyId: '41114'  },
  { name: 'Blue Heron Bridge',        buoyId: 'LKWF1'  },
  { name: 'Palm Beach / Singer Island', buoyId: 'LKWF1' },
  { name: 'Deerfield / Pompano',      buoyId: '41122'  },
  { name: 'Fort Lauderdale',          buoyId: '41122'  },
  { name: 'Miami / Key Biscayne',     buoyId: 'SPGF1'  },
  { name: 'Key Largo / Upper Keys',   buoyId: 'SMKF1'  },
]

type Rating = 'Good' | 'Marginal' | 'Rough' | 'N/A'

function rateConditions(buoy: BuoyData | undefined): Rating {
  if (!buoy || buoy.error) return 'N/A'
  if (buoy.waveHeight) {
    const wh = parseFloat(buoy.waveHeight)
    if (wh < 2) return 'Good'
    if (wh < 4) return 'Marginal'
    return 'Rough'
  }
  // Inshore stations (e.g. LKWF1) may not report wave height — fall back to wind
  if (buoy.windSpeed) {
    const ws = parseFloat(buoy.windSpeed)
    if (ws < 12) return 'Good'
    if (ws < 20) return 'Marginal'
    return 'Rough'
  }
  return 'N/A'
}

const ratingColor: Record<Rating, string> = {
  Good:     'text-emerald-400',
  Marginal: 'text-yellow-400',
  Rough:    'text-red-400',
  'N/A':    'text-slate-500',
}

export default function RegionalConditionsTable({ buoys }: { buoys: BuoyData[] }) {
  const byId = Object.fromEntries(buoys.map(b => [b.stationId, b]))

  return (
    <section>
      <div className="flex items-center gap-2 mb-5">
        <h2 className="text-2xl font-bold text-white">Regional Conditions</h2>
        <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-full">NOAA NDBC</span>
      </div>
      <div className="bg-slate-800 rounded-2xl shadow-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left px-5 py-3 text-slate-400 font-medium whitespace-nowrap">Region</th>
              <th className="text-left px-5 py-3 text-slate-400 font-medium whitespace-nowrap">Conditions</th>
              <th className="text-left px-5 py-3 text-slate-400 font-medium whitespace-nowrap">Waves</th>
              <th className="text-left px-5 py-3 text-slate-400 font-medium whitespace-nowrap">Period</th>
              <th className="text-left px-5 py-3 text-slate-400 font-medium whitespace-nowrap">Wind</th>
              <th className="text-left px-5 py-3 text-slate-400 font-medium whitespace-nowrap">Water Temp</th>
            </tr>
          </thead>
          <tbody>
            {REGIONS.map(({ name, buoyId }, i) => {
              const buoy = byId[buoyId]
              const rating = rateConditions(buoy)
              return (
                <tr
                  key={name}
                  className={`border-b border-slate-700/50 ${i % 2 === 0 ? '' : 'bg-slate-700/20'}`}
                >
                  <td className="px-5 py-3 text-white font-medium whitespace-nowrap">{name}</td>
                  <td className="px-5 py-3">
                    <span className={`font-semibold ${ratingColor[rating]}`}>{rating}</span>
                  </td>
                  <td className="px-5 py-3 text-slate-300 whitespace-nowrap">
                    {buoy?.waveHeight ? `${buoy.waveHeight} ft` : '—'}
                  </td>
                  <td className="px-5 py-3 text-slate-300 whitespace-nowrap">
                    {buoy?.wavePeriod ? `${buoy.wavePeriod}s` : '—'}
                  </td>
                  <td className="px-5 py-3 text-slate-300 whitespace-nowrap">
                    {buoy?.windSpeed
                      ? `${buoy.windSpeed} kt${buoy.windDir ? ` ${buoy.windDir}` : ''}`
                      : '—'}
                  </td>
                  <td className="px-5 py-3 text-slate-300 whitespace-nowrap">
                    {buoy?.waterTemp ? `${buoy.waterTemp}°F` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
