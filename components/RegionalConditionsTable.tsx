import { BuoyData } from '@/lib/noaa'

const REGIONS: { name: string; buoyId: string; proxyNote?: string }[] = [
  { name: 'Space Coast',              buoyId: '41009'  },
  { name: 'Treasure Coast (Vero Beach / Ft Pierce)', buoyId: '41114' },
  { name: 'Blue Heron Bridge',        buoyId: 'LKWF1'  },
  { name: 'Palm Beach / Singer Island', buoyId: 'LKWF1' },
  { name: 'Deerfield / Pompano',      buoyId: '41122'  },
  { name: 'Fort Lauderdale',          buoyId: '41122'  },
  { name: 'Miami / Key Biscayne',     buoyId: '41122'  },
  { name: 'Key Largo / Upper Keys',   buoyId: 'SMKF1', proxyNote: 'Molasses buoy offline since 2023 — Marathon proxy' },
  { name: 'Marathon / Middle Keys',   buoyId: 'SMKF1'  },
  { name: 'Key West / Lower Keys',    buoyId: '42095'  },
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


// Offshore viz proxy — only meaningful for buoys 6+ nm out.
// Factors: wave height (primary), wave period (swell vs chop), 24h rainfall (runoff penalty).
function vizEstimate(buoy: BuoyData | undefined, precip24hMm: number): { range: string; color: string } | null {
  if (!buoy || buoy.error || buoy.offshoreNm < 6 || !buoy.waveHeight) return null
  const wh = parseFloat(buoy.waveHeight)
  const wp = buoy.wavePeriod ? parseFloat(buoy.wavePeriod) : 0

  // Base from wave height — South FL Gulf Stream keeps water clear; be optimistic
  let lo: number, hi: number
  if      (wh < 1)   { lo = 60; hi = 100 }
  else if (wh < 2)   { lo = 40; hi = 80  }
  else if (wh < 3)   { lo = 25; hi = 55  }
  else if (wh < 4)   { lo = 15; hi = 40  }
  else if (wh < 6)   { lo = 8;  hi = 25  }
  else               { lo = 3;  hi = 15  }

  // Swell bonus: long period = energy goes deep, less surface chop = less sediment stirring
  if (wp >= 12)             { lo = Math.min(lo + 15, 100); hi = Math.min(hi + 20, 120) }
  else if (wp >= 8)         { lo = Math.min(lo + 5,  100); hi = Math.min(hi + 8,  120) }
  else if (wp > 0 && wp < 5) { lo = Math.max(lo - 8,  0);  hi = Math.max(hi - 12,  5) }

  // Rainfall penalty: runoff carries sediment into coastal water
  if      (precip24hMm > 25) { lo = Math.round(lo * 0.5); hi = Math.round(hi * 0.55) }  // heavy rain
  else if (precip24hMm > 10) { lo = Math.round(lo * 0.7); hi = Math.round(hi * 0.75) }  // moderate rain
  else if (precip24hMm > 3)  { lo = Math.round(lo * 0.85); hi = Math.round(hi * 0.85) } // light rain

  lo = Math.max(lo, 2); hi = Math.max(hi, 5)
  const color = hi >= 50 ? 'text-emerald-400' : hi >= 30 ? 'text-cyan-400' : hi >= 15 ? 'text-yellow-400' : 'text-red-400'
  return { range: `${lo}–${hi} ft`, color }
}

const ratingColor: Record<Rating, string> = {
  Good:     'text-emerald-400',
  Marginal: 'text-yellow-400',
  Rough:    'text-red-400',
  'N/A':    'text-slate-500',
}

export default function RegionalConditionsTable({ buoys, precip24hMm = 0 }: { buoys: BuoyData[]; precip24hMm?: number }) {
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
            {REGIONS.map(({ name, buoyId, proxyNote }, i) => {
              const buoy = byId[buoyId]
              const { rating, windOnly } = rateConditions(buoy)
              const viz = vizEstimate(buoy, precip24hMm)
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
                    {proxyNote
                      ? <span className="block text-xs text-amber-500/80">{proxyNote}</span>
                      : <span className="block text-xs text-slate-600">{buoyId}</span>
                    }
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
                  <td className={`px-5 py-3 whitespace-nowrap font-medium ${viz ? viz.color : 'text-slate-600'}`}>
                    {viz ? viz.range : '—'}
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
      <p className="text-xs text-slate-600 mt-2">Viz Est. is an offshore proxy from buoy wave data — not a measurement. Turbidity and runoff can make water milky even in calm conditions; inshore viz varies independently. Use community reports below for actual observed visibility.</p>
    </section>
  )
}
