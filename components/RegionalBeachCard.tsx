import { BuoyData } from '@/lib/noaa'

type RipRisk = 'Low' | 'Elevated' | 'High'
type FlagColor = 'Green' | 'Yellow' | 'Red' | 'Double Red'
type SwimSafety = 'Good' | 'Use Caution' | 'Dangerous'

function n(v: string | null | undefined): number | null {
  if (!v) return null
  const x = parseFloat(v)
  return isNaN(x) ? null : x
}

function computeReport(wave: BuoyData | undefined, wind: BuoyData | undefined) {
  const waveHt = n(wave?.waveHeight)
  const wavePd = n(wave?.wavePeriod)
  const windKt = n(wind?.windSpeed) ?? n(wave?.windSpeed)
  const windDir = wind?.windDir ?? wave?.windDir ?? ''
  const waterTemp = wave?.waterTemp ?? wind?.waterTemp ?? null

  if (waveHt === null && windKt === null) {
    return {
      safety: 'Use Caution' as SwimSafety,
      ripRisk: 'Elevated' as RipRisk,
      flagColor: 'Yellow' as FlagColor,
      waterTemp, seaState: 'Unknown', hasData: false,
      detail: 'No buoy data right now. Check posted flags at the beach before getting in.',
      bestTime: null,
    }
  }

  const wh = waveHt ?? 0
  const ws = windKt ?? 0
  const isOnshore = /^(N|NE|E|ENE|NNE)/.test(windDir)

  let ripRisk: RipRisk
  if (wh > 3 || (wavePd !== null && wavePd < 6 && wh > 1) || (ws > 20 && isOnshore)) {
    ripRisk = 'High'
  } else if (wh >= 2 || (wavePd !== null && wavePd < 8 && wh >= 1.5) || (ws > 15 && isOnshore)) {
    ripRisk = 'Elevated'
  } else {
    ripRisk = 'Low'
  }

  let flagColor: FlagColor
  if (wh > 6 || (wh > 4 && ws > 25)) flagColor = 'Double Red'
  else if (wh >= 3 || ws > 20)        flagColor = 'Red'
  else if (wh >= 2 || ws > 10)        flagColor = 'Yellow'
  else                                 flagColor = 'Green'

  let safety: SwimSafety
  if (flagColor === 'Double Red' || flagColor === 'Red' || ripRisk === 'High') safety = 'Dangerous'
  else if (flagColor === 'Yellow' || ripRisk === 'Elevated')                   safety = 'Use Caution'
  else                                                                          safety = 'Good'

  let seaState: string
  if (wh < 1)       seaState = 'Calm'
  else if (wh < 2)  seaState = 'Mild chop'
  else if (wh < 3.5) seaState = 'Choppy'
  else if (wh < 6)  seaState = 'Rough'
  else              seaState = 'Very rough'

  let detail: string
  if (safety === 'Good') {
    detail = 'Low surf and light wind. Easy entry and calm shore break.'
  } else if (ripRisk === 'High') {
    detail = 'Strong rip current risk. Swim near a lifeguard stand or stay out of the water.'
  } else {
    detail = `${seaState} surf with possible rip currents. If caught in a rip, swim parallel to shore, then angle back in.`
  }

  const bestTime = ws > 12
    ? 'Morning tends to be calmer before the sea breeze builds.'
    : null

  return { safety, ripRisk, flagColor, waterTemp, seaState, hasData: true, detail, bestTime }
}

const safetyConfig = {
  'Good':        { bg: 'bg-emerald-500',  text: 'text-white',         dot: '🟢' },
  'Use Caution': { bg: 'bg-yellow-400',   text: 'text-slate-900',     dot: '🟡' },
  'Dangerous':   { bg: 'bg-red-600',      text: 'text-white',         dot: '🔴' },
}

const flagConfig = {
  'Green':      { bg: 'bg-emerald-500', text: 'text-white' },
  'Yellow':     { bg: 'bg-yellow-400',  text: 'text-slate-900' },
  'Red':        { bg: 'bg-red-500',     text: 'text-white' },
  'Double Red': { bg: 'bg-red-800',     text: 'text-white' },
}

const ripConfig = {
  'Low':      'text-emerald-400',
  'Elevated': 'text-yellow-400',
  'High':     'text-red-400',
}

export interface BeachRegion {
  name: string
  beaches: string[]
  waveBuoyId: string
  windBuoyId?: string
}

export default function RegionalBeachCard({
  region,
  buoys,
}: {
  region: BeachRegion
  buoys: BuoyData[]
}) {
  const byId = (id: string) => buoys.find(b => b.stationId === id)
  const waveBuoy = byId(region.waveBuoyId)
  const windBuoy = region.windBuoyId ? byId(region.windBuoyId) : undefined

  const report = computeReport(waveBuoy, windBuoy ?? waveBuoy)
  const sc = safetyConfig[report.safety]
  const fc = flagConfig[report.flagColor]
  const ripColor = ripConfig[report.ripRisk]

  const tempF = n(report.waterTemp)
  const tempLabel = tempF === null ? null
    : tempF >= 82 ? 'warm'
    : tempF >= 78 ? 'comfortable'
    : tempF >= 74 ? 'mild'
    : 'cool'

  return (
    <div className="bg-slate-800/70 rounded-2xl overflow-hidden border border-slate-700/50">
      {/* Region header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-white font-bold text-lg leading-tight">{region.name}</h3>
            <p className="text-slate-500 text-xs mt-0.5">{region.beaches.join(' · ')}</p>
          </div>
          <span className={`flex-shrink-0 text-xs font-bold px-3 py-1 rounded-full ${sc.bg} ${sc.text}`}>
            {sc.dot} {report.safety}
          </span>
        </div>
      </div>

      {/* Detail line */}
      <div className="px-5 pb-4">
        <p className="text-slate-300 text-sm leading-relaxed">{report.detail}</p>
        {report.bestTime && (
          <p className="text-slate-500 text-xs mt-1">{report.bestTime}</p>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 border-t border-slate-700/50">
        <div className="px-3 py-3 border-r border-slate-700/50">
          <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Rip</p>
          <p className={`text-sm font-bold ${ripColor}`}>{report.ripRisk}</p>
        </div>
        <div className="px-3 py-3 border-r border-slate-700/50">
          <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Flag</p>
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${fc.bg} ${fc.text}`}>
            {report.flagColor}
          </span>
        </div>
        <div className="px-3 py-3 border-r border-slate-700/50">
          <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Water</p>
          <p className="text-sm font-bold text-sky-300">
            {tempF !== null ? `${tempF}°F` : '—'}
          </p>
          {tempLabel && <p className="text-slate-500 text-xs">{tempLabel}</p>}
        </div>
        <div className="px-3 py-3">
          <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Surf</p>
          <p className="text-sm font-bold text-slate-200">{report.seaState}</p>
        </div>
      </div>
    </div>
  )
}
