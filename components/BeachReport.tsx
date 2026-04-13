import { BuoyData } from '@/lib/noaa'

type RipRisk = 'Low' | 'Elevated' | 'High'
type FlagColor = 'Green' | 'Yellow' | 'Red' | 'Double Red'
type SwimSafety = 'Good' | 'Use Caution' | 'Dangerous'

function n(v: string | null | undefined): number | null {
  if (!v) return null
  const x = parseFloat(v)
  return isNaN(x) ? null : x
}

interface BeachData {
  safety: SwimSafety
  ripRisk: RipRisk
  flagColor: FlagColor
  waterTemp: string | null
  seaState: string
  detail: string
  bestTime: string | null
  hasData: boolean
}

function computeBeachData(buoys: BuoyData[]): BeachData {
  const byId = (id: string) => buoys.find(b => b.stationId === id)
  const offshore = byId('41122') ?? byId('41009') ?? byId('41114')
  const inshore  = byId('LKWF1') ?? offshore

  const waveHt  = n(offshore?.waveHeight)
  const wavePd  = n(offshore?.wavePeriod)
  const windKt  = n(inshore?.windSpeed) ?? n(offshore?.windSpeed)
  const windDir = inshore?.windDir ?? offshore?.windDir ?? ''
  const waterTemp = offshore?.waterTemp ?? inshore?.waterTemp ?? null

  if (waveHt === null && windKt === null) {
    return {
      safety: 'Use Caution', ripRisk: 'Elevated', flagColor: 'Yellow',
      waterTemp, seaState: 'Unknown',
      detail: 'No buoy data right now. Check posted flags at the beach before getting in.',
      bestTime: null, hasData: false,
    }
  }

  const wh = waveHt ?? 0
  const ws = windKt ?? 0
  const isOnshore = /^(N|NE|E|ENE|NNE)/.test(windDir)

  // Rip current risk
  let ripRisk: RipRisk
  if (wh > 3 || (wavePd !== null && wavePd < 6 && wh > 1) || (ws > 20 && isOnshore)) {
    ripRisk = 'High'
  } else if (wh >= 2 || (wavePd !== null && wavePd < 8 && wh >= 1.5) || (ws > 15 && isOnshore)) {
    ripRisk = 'Elevated'
  } else {
    ripRisk = 'Low'
  }

  // Flag color estimate
  let flagColor: FlagColor
  if (wh > 6 || (wh > 4 && ws > 25)) {
    flagColor = 'Double Red'
  } else if (wh >= 3 || ws > 20) {
    flagColor = 'Red'
  } else if (wh >= 2 || ws > 10) {
    flagColor = 'Yellow'
  } else {
    flagColor = 'Green'
  }

  // Overall swim safety
  let safety: SwimSafety
  if (flagColor === 'Double Red' || flagColor === 'Red' || ripRisk === 'High') {
    safety = 'Dangerous'
  } else if (flagColor === 'Yellow' || ripRisk === 'Elevated') {
    safety = 'Use Caution'
  } else {
    safety = 'Good'
  }

  // Sea state plain English
  let seaState: string
  if (wh < 1)    seaState = 'Calm'
  else if (wh < 2)    seaState = 'Mild chop'
  else if (wh < 3.5)  seaState = 'Choppy'
  else if (wh < 6)    seaState = 'Rough'
  else                seaState = 'Very rough'

  // Plain-English detail
  let detail: string
  if (safety === 'Good') {
    detail = 'Low surf and light wind. Easy entry, calm shore break. Good day for families and casual swimmers.'
  } else if (ripRisk === 'Elevated') {
    detail = `${seaState.toLowerCase()} surf with possible rip currents. If you get caught in a rip, stay calm, swim parallel to shore, then angle back in.`
  } else if (ripRisk === 'High') {
    detail = 'Strong rip current risk. Rough surf may push you down the beach fast. Swim only near a lifeguard stand, or stay dry and enjoy the sand.'
  } else {
    detail = `${seaState} conditions. Check posted flags before entering the water.`
  }

  // Best time suggestion based on typical sea breeze pattern
  let bestTime: string | null = null
  if (ws > 12) {
    bestTime = 'Morning (before 10 AM) is typically calmer before the sea breeze picks up.'
  } else if (safety === 'Good') {
    bestTime = null // no need to qualify a good day
  }

  return { safety, ripRisk, flagColor, waterTemp, seaState, detail, bestTime, hasData: true }
}

const safetyConfig: Record<SwimSafety, { bg: string; border: string; text: string; dot: string; label: string }> = {
  'Good':        { bg: 'bg-emerald-950/60', border: 'border-emerald-500/40', text: 'text-emerald-300', dot: 'bg-emerald-400', label: 'Good for swimming' },
  'Use Caution': { bg: 'bg-yellow-950/60',  border: 'border-yellow-500/40',  text: 'text-yellow-300',  dot: 'bg-yellow-400',  label: 'Use caution' },
  'Dangerous':   { bg: 'bg-red-950/60',     border: 'border-red-500/40',     text: 'text-red-300',     dot: 'bg-red-400',     label: 'Dangerous conditions' },
}

const ripConfig: Record<RipRisk, { color: string; icon: string }> = {
  Low:      { color: 'text-emerald-400', icon: '🟢' },
  Elevated: { color: 'text-yellow-400',  icon: '🟡' },
  High:     { color: 'text-red-400',     icon: '🔴' },
}

const flagConfig: Record<FlagColor, { bg: string; text: string }> = {
  'Green':       { bg: 'bg-emerald-500', text: 'text-white' },
  'Yellow':      { bg: 'bg-yellow-400',  text: 'text-slate-900' },
  'Red':         { bg: 'bg-red-500',     text: 'text-white' },
  'Double Red':  { bg: 'bg-red-700',     text: 'text-white' },
}

export default function BeachReport({ buoys }: { buoys: BuoyData[] }) {
  const data = computeBeachData(buoys)
  const sc   = safetyConfig[data.safety]
  const rc   = ripConfig[data.ripRisk]
  const fc   = flagConfig[data.flagColor]

  const tempF = n(data.waterTemp)
  const tempLabel = tempF === null ? null
    : tempF >= 82 ? `${tempF}°F — warm`
    : tempF >= 78 ? `${tempF}°F — comfortable`
    : tempF >= 74 ? `${tempF}°F — mild`
    : `${tempF}°F — cool`

  return (
    <section id="beach">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-2xl font-bold text-white">Beach Conditions</h2>
        <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-full">Today</span>
      </div>

      {/* Main safety banner */}
      <div className={`rounded-2xl border p-5 mb-4 ${sc.bg} ${sc.border}`}>
        <div className="flex items-center gap-3 mb-2">
          <span className={`w-3 h-3 rounded-full flex-shrink-0 ${sc.dot}`} />
          <span className={`text-lg font-bold ${sc.text}`}>{sc.label}</span>
        </div>
        <p className="text-slate-300 text-sm leading-relaxed">{data.detail}</p>
        {data.bestTime && (
          <p className="text-slate-400 text-xs mt-2">{data.bestTime}</p>
        )}
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Rip current risk */}
        <div className="bg-slate-800 rounded-xl p-4 flex flex-col gap-1">
          <span className="text-xs text-slate-500 uppercase tracking-wide">Rip Current</span>
          <span className={`text-base font-bold ${rc.color}`}>{rc.icon} {data.ripRisk}</span>
          <span className="text-xs text-slate-500">
            {data.ripRisk === 'Low'      ? 'Safe to swim' :
             data.ripRisk === 'Elevated' ? 'Swim near guards' :
                                          'High risk today'}
          </span>
        </div>

        {/* Flag estimate */}
        <div className="bg-slate-800 rounded-xl p-4 flex flex-col gap-1">
          <span className="text-xs text-slate-500 uppercase tracking-wide">Flag Estimate</span>
          <span className={`text-sm font-bold px-2 py-0.5 rounded self-start ${fc.bg} ${fc.text}`}>
            {data.flagColor}
          </span>
          <span className="text-xs text-slate-500">Check posted flags</span>
        </div>

        {/* Water temp */}
        <div className="bg-slate-800 rounded-xl p-4 flex flex-col gap-1">
          <span className="text-xs text-slate-500 uppercase tracking-wide">Water Temp</span>
          {tempLabel ? (
            <>
              <span className="text-base font-bold text-sky-300">{n(data.waterTemp)}°F</span>
              <span className="text-xs text-slate-500">{tempLabel.split('— ')[1]}</span>
            </>
          ) : (
            <span className="text-sm text-slate-500">No data</span>
          )}
        </div>

        {/* Sea state */}
        <div className="bg-slate-800 rounded-xl p-4 flex flex-col gap-1">
          <span className="text-xs text-slate-500 uppercase tracking-wide">Sea State</span>
          <span className="text-base font-bold text-slate-200">{data.seaState}</span>
          <span className="text-xs text-slate-500">Shore break</span>
        </div>
      </div>

      <p className="text-xs text-slate-600 mt-3">
        Flag estimate based on NOAA buoy data (20–60 nm offshore). Nearshore conditions vary — always check posted flags and swim near a lifeguard.
      </p>
    </section>
  )
}
