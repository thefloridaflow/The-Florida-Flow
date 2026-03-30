import { BuoyData } from '@/lib/noaa'

type Rating = 'Good' | 'Marginal' | 'Rough' | 'Poor' | 'Small' | 'N/A'

const ratingStyle: Record<Rating, string> = {
  Good:     'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  Marginal: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  Rough:    'bg-red-500/20 text-red-400 border border-red-500/30',
  Poor:     'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  Small:    'bg-slate-600/40 text-slate-400 border border-slate-600',
  'N/A':    'bg-slate-700/50 text-slate-500 border border-slate-700',
}

function n(v: string | null | undefined): number | null {
  if (!v) return null
  const x = parseFloat(v)
  return isNaN(x) ? null : x
}

interface Verdict {
  activity: string
  icon: string
  rating: Rating
  detail: string
}

function computeVerdicts(buoys: BuoyData[]): Verdict[] {
  const byId = (id: string) => buoys.find(b => b.stationId === id)

  // Best offshore buoy near SE FL for open-ocean wave/wind readings
  const offshore = byId('41122') ?? byId('41009')
  // Inshore wind reference
  const inshore  = byId('LKWF1') ?? offshore
  const keys     = byId('SMKF1')

  const waveHt = n(offshore?.waveHeight)
  const wavePd = n(offshore?.wavePeriod)
  const windKt = n(inshore?.windSpeed) ?? n(offshore?.windSpeed)

  // ── Scuba Diving ─────────────────────────────────────────────
  const divingRating: Rating = (() => {
    if (waveHt === null && windKt === null) return 'N/A'
    const wh = waveHt ?? 0
    const ws = windKt ?? 0
    if (wh < 1.5 && ws < 12) return 'Good'
    if (wh < 2.5 && ws < 20) return 'Marginal'
    return 'Rough'
  })()
  const divingDetail = (() => {
    const parts: string[] = []
    if (waveHt !== null) parts.push(`${offshore!.waveHeight} ft offshore`)
    if (windKt !== null) parts.push(`${inshore?.windSpeed ?? offshore?.windSpeed} kt wind`)
    return parts.join(' · ') || 'Buoy data unavailable'
  })()

  // ── Surfing ───────────────────────────────────────────────────
  // Higher waves = better; period matters too
  const surfRating: Rating = (() => {
    if (waveHt === null) return 'N/A'
    if (waveHt < 1.5) return 'Small'
    if (waveHt < 2.5) return 'Poor'
    if (waveHt <= 8)  return 'Good'
    return 'Rough'
  })()
  const surfDetail = (() => {
    if (waveHt === null) return 'Buoy data unavailable'
    const pd = wavePd !== null ? ` @ ${offshore!.wavePeriod}s` : ''
    let quality = ''
    if (wavePd !== null) {
      if (wavePd >= 12)      quality = 'long-period groundswell · clean lines'
      else if (wavePd >= 8)  quality = 'moderate period · decent shape'
      else                   quality = 'short period · wind chop'
    }
    const windNote = windKt !== null
      ? windKt > 20 ? ' · strong onshore wind' : windKt < 8 ? ' · light wind (offshore likely)' : ''
      : ''
    return `${offshore!.waveHeight} ft${pd} · ${quality || offshore!.name}${windNote}`
  })()

  // ── Kayak / SUP ───────────────────────────────────────────────
  const kayakRating: Rating = (() => {
    if (waveHt === null && windKt === null) return 'N/A'
    const wh = waveHt ?? 0
    const ws = windKt ?? 0
    if (wh < 1.5 && ws < 12) return 'Good'
    if (wh < 3   && ws < 18) return 'Marginal'
    return 'Rough'
  })()
  const kayakDetail = (() => {
    const parts: string[] = []
    if (waveHt !== null) parts.push(`${offshore!.waveHeight} ft seas`)
    if (windKt !== null) parts.push(`${windKt.toFixed(1)} kt wind`)
    return parts.join(' · ') || 'Buoy data unavailable'
  })()

  // ── Boating / Fishing ─────────────────────────────────────────
  const boatRating: Rating = (() => {
    if (waveHt === null && windKt === null) return 'N/A'
    const wh = waveHt ?? 0
    const ws = windKt ?? 0
    if (wh < 2 && ws < 15) return 'Good'
    if (wh < 4 && ws < 20) return 'Marginal'
    return 'Rough'
  })()
  const boatDetail = (() => {
    const parts: string[] = []
    if (waveHt !== null) parts.push(`${offshore!.waveHeight} ft seas`)
    if (windKt !== null) parts.push(`${windKt.toFixed(1)} kt wind`)
    return parts.join(' · ') || 'Buoy data unavailable'
  })()

  // ── Beach / Swimming ──────────────────────────────────────────
  // Use Keys buoy if available for southernmost reference, else offshore FL
  const beachBuoy = keys ?? offshore
  const beachWave = n(beachBuoy?.waveHeight) ?? waveHt
  const beachRating: Rating = (() => {
    if (beachWave === null) return 'N/A'
    if (beachWave < 2)   return 'Good'
    if (beachWave < 3.5) return 'Marginal'
    return 'Rough'
  })()
  const beachDetail = beachWave !== null
    ? `${beachWave.toFixed(1)} ft offshore · calmer nearshore`
    : 'Buoy data unavailable'

  return [
    { activity: 'Scuba Diving',      icon: '🤿', rating: divingRating, detail: divingDetail },
    { activity: 'Surfing',           icon: '🏄', rating: surfRating,   detail: surfDetail   },
    { activity: 'Kayak / SUP',       icon: '🛶', rating: kayakRating,  detail: kayakDetail  },
    { activity: 'Boating / Fishing', icon: '⚓', rating: boatRating,   detail: boatDetail   },
    { activity: 'Beach / Swimming',  icon: '🏖️', rating: beachRating,  detail: beachDetail  },
  ]
}

export default function ActivityVerdicts({ buoys }: { buoys: BuoyData[] }) {
  const verdicts = computeVerdicts(buoys)

  return (
    <section>
      <div className="flex items-center gap-2 mb-5">
        <h2 className="text-2xl font-bold text-white">By Activity</h2>
        <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-full">Today&apos;s Verdict</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {verdicts.map(({ activity, icon, rating, detail }) => (
          <div key={activity} className="bg-slate-800 rounded-2xl p-4 shadow-lg flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">{icon}</span>
              <span className="text-white font-medium text-sm">{activity}</span>
            </div>
            <span className={`self-start px-2.5 py-1 rounded-full text-xs font-bold ${ratingStyle[rating]}`}>
              {rating}
            </span>
            <p className="text-slate-500 text-xs leading-relaxed">{detail}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
