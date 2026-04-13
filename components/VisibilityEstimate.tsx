import { BuoyData } from '@/lib/noaa'

interface Estimate {
  range: string
  label: string
  color: string
  note: string
}

function estimate(buoys: BuoyData[]): Estimate {
  const byId = (id: string) => buoys.find(b => b.stationId === id)

  // Prefer the inshore buoy; wave height is often MM there so fall back to offshore
  const candidates = ['LKWF1', '41122', '41009', 'SMKF1']
  const source = candidates.map(byId).find(b => b && !b.error && b.waveHeight !== null)

  if (!source?.waveHeight) {
    return { range: '—', label: 'Unknown', color: 'text-slate-500', note: 'No wave data available' }
  }

  const wh = parseFloat(source.waveHeight)
  const wp = source.wavePeriod ? parseFloat(source.wavePeriod) : 0

  // Base visibility range from wave height
  let lo: number, hi: number
  if      (wh < 1)   { lo = 40; hi = 80 }
  else if (wh < 2)   { lo = 25; hi = 50 }
  else if (wh < 3)   { lo = 10; hi = 25 }
  else if (wh < 4.5) { lo = 3;  hi = 15 }
  else               { lo = 0;  hi = 5  }

  // Wave period modifier: long-period swell penetrates to the seafloor and stirs sediment more
  // than short-period chop which stays near the surface — so long period = worse viz for diving
  if (wp >= 9) { lo = Math.max(lo - 10, 0); hi = Math.max(hi - 10, 2) }
  else if (wp > 0 && wp <= 5 && wh < 2) {
    // short steep chop stays near surface — bottom less affected, don't penalize
  }

  const label = hi >= 50 ? 'Excellent' : hi >= 30 ? 'Good' : hi >= 15 ? 'Fair' : 'Poor'
  const color =
    hi >= 50 ? 'text-emerald-400' :
    hi >= 30 ? 'text-cyan-400' :
    hi >= 15 ? 'text-yellow-400' :
               'text-red-400'

  const note = `Derived from ${source.name} (${source.waveHeight} ft waves${wp ? `, ${source.wavePeriod}s period` : ''}) · rough proxy only`

  return { range: `${lo}–${hi} ft`, label, color, note }
}

export default function VisibilityEstimate({ buoys }: { buoys: BuoyData[] }) {
  const { range, label, color, note } = estimate(buoys)

  return (
    <div className="bg-slate-800 rounded-2xl p-5 shadow-lg">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">👁</span>
        <div>
          <h3 className="text-white font-bold text-lg">Water Visibility</h3>
          <p className="text-slate-400 text-sm">Estimated · not measured</p>
        </div>
      </div>

      <div className="flex items-end gap-3 mb-4">
        <span className={`text-4xl font-bold ${color}`}>{range}</span>
        <span className={`text-lg font-semibold mb-0.5 ${color}`}>{label}</span>
      </div>

      <div className="space-y-2">
        {[
          { band: '40+ ft', desc: 'Excellent — crystal clear', threshold: 'text-emerald-400' },
          { band: '25–40 ft', desc: 'Good — minor haze',       threshold: 'text-cyan-400'    },
          { band: '10–25 ft', desc: 'Fair — moderate turbidity', threshold: 'text-yellow-400' },
          { band: '< 10 ft',  desc: 'Poor — low viz',           threshold: 'text-red-400'    },
        ].map(({ band, desc, threshold }) => (
          <div key={band} className="flex items-center gap-2 text-xs">
            <span className={`w-16 font-medium ${threshold}`}>{band}</span>
            <span className="text-slate-500">{desc}</span>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-slate-600 leading-relaxed">{note}</p>
    </div>
  )
}
