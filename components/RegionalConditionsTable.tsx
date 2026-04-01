import { BuoyData } from '@/lib/noaa'

const REGIONS: { name: string; buoyId: string }[] = [
  { name: 'Space Coast',              buoyId: '41009'  },
  { name: 'Treasure Coast (Vero Beach / Ft Pierce)', buoyId: '41114' },
  { name: 'Blue Heron Bridge',        buoyId: 'LKWF1'  },
  { name: 'Palm Beach / Singer Island', buoyId: 'LKWF1' },
  { name: 'Deerfield / Pompano',      buoyId: '41122'  },
  { name: 'Fort Lauderdale',          buoyId: '41122'  },
  { name: 'Miami / Key Biscayne',     buoyId: '41122'  },
  { name: 'Key Largo / Upper Keys',   buoyId: '42095'  },
]

type Rating = 'Good' | 'Marginal' | 'Rough' | 'N/A'

function rateConditions(buoy: BuoyData | undefined): { rating: Rating; windOnly: boolean } {
  if (!buoy || buoy.error) return { rating: 'N/A', windOnly: false }
  if (buoy.waveHeight) {
    const wh = parseFloat(buoy.waveHeight)
    const rating: Rating = wh < 2 ? 'Good' : wh < 4 ? 'Marginal' : 'Rough'
    return { rating, windOnly: false }
  }
  // Inshore stations (e.g. LKWF1) — no wave height, use wind as proxy
  if (buoy.windSpeed) {
    const ws = parseFloat(buoy.windSpeed)
    const rating: Rating = ws < 12 ? 'Good' : ws < 20 ? 'Marginal' : 'Rough'
    return { rating, windOnly: true }
  }
  return { rating: 'N/A', windOnly: false }
}

function vizEstimate(buoy: BuoyData | undefined): { range: string; color: string } {
  if (!buoy || buoy.error || !buoy.waveHeight) return { range: '—', color: 'text-slate-500' }
  const wh = parseFloat(buoy.waveHeight)
  const wp = buoy.wavePeriod ? parseFloat(buoy.wavePeriod) : 0
  let lo: number, hi: number
  if      (wh < 1)   { lo = 40; hi = 80 }
  else if (wh < 2)   { lo = 25; hi = 50 }
  else if (wh < 3)   { lo = 10; hi = 25 }
  else if (wh < 4.5) { lo = 3;  hi = 15 }
  else               { lo = 0;  hi = 5  }
  if (wp > 12)            { lo = Math.min(lo + 10, 80); hi = Math.min(hi + 15, 100) }
  else if (wp > 0 && wp < 6) { lo = Math.max(lo - 8, 0); hi = Math.max(hi - 8, 2) }
  const color = hi >= 30 ? 'text-emerald-400' : hi >= 15 ? 'text-cyan-400' : hi >= 8 ? 'text-yellow-400' : 'text-red-400'
  return { range: `${lo}–${hi} ft`, color }
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
              <th className="text-left px-5 py-3 text-slate-400 font-medium whitespace-nowrap">Viz Est.</th>
              <th className="text-left px-5 py-3 text-slate-400 font-medium whitespace-nowrap">Offshore</th>
            </tr>
          </thead>
          <tbody>
            {REGIONS.map(({ name, buoyId }, i) => {
              const buoy = byId[buoyId]
              const { rating, windOnly } = rateConditions(buoy)
              const viz = vizEstimate(buoy)
              const offshoreLabel = buoy
                ? buoy.offshoreNm === 0 ? 'Inshore' : `~${buoy.offshoreNm} nm`
                : '—'
              return (
                <tr
                  key={name}
                  className={`border-b border-slate-700/50 ${i % 2 === 0 ? '' : 'bg-slate-700/20'}`}
                >
                  <td className="px-5 py-3 whitespace-nowrap">
                    <span className="text-white font-medium">{name}</span>
                    <span className="block text-xs text-slate-600">{buoyId}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`font-semibold ${ratingColor[rating]}`}>{rating}</span>
                    {windOnly && <span className="text-slate-600 text-xs ml-1.5">(wind)</span>}
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
                  <td className={`px-5 py-3 whitespace-nowrap font-medium ${viz.color}`}>
                    {viz.range}
                  </td>
                  <td className="px-5 py-3 text-slate-500 whitespace-nowrap text-xs">
                    {offshoreLabel}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-600 mt-2">Viz Est. is a rough proxy derived from wave height and period — not a measurement.</p>
    </section>
  )
}
