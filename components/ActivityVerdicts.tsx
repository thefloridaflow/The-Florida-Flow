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
    if (waveHt === null && windKt === null) return 'No buoy data — check local conditions before diving.'
    const wh = waveHt ?? 0; const ws = windKt ?? 0
    const seas = waveHt !== null ? `${offshore!.waveHeight} ft seas` : ''
    const wind = windKt !== null ? `${ws.toFixed(1)} kt wind` : ''
    const base = [seas, wind].filter(Boolean).join(', ')
    if (wh < 1.5 && ws < 12)
      return `${base} — calm and clear. Shore dives like BHB should be easy. Excellent visibility conditions expected.`
    if (wh < 2.5 && ws < 20)
      return `${base} — manageable for experienced divers. Shore entry sites may have light surge; boat dives comfortable. Check viz locally.`
    return `${base} — rough conditions. Strong surge expected at shore entry sites. Boat dives with caution; poor nearshore visibility likely.`
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
    if (waveHt === null) return 'No buoy data — check local surf reports.'
    const pd = wavePd !== null ? ` @ ${offshore!.wavePeriod}s` : ''
    let quality = ''
    let advice = ''
    if (wavePd !== null) {
      if (wavePd >= 12)      { quality = 'long-period groundswell'; advice = 'Expect clean, punchy lines — best conditions.' }
      else if (wavePd >= 8)  { quality = 'moderate period'; advice = 'Decent shape, some texture possible.' }
      else                   { quality = 'short period wind chop'; advice = 'Bumpy, difficult to read — boards with volume preferred.' }
    }
    const windNote = windKt !== null && windKt > 20
      ? ' Strong onshore wind adding chop to the face.'
      : windKt !== null && windKt < 8
      ? ' Light wind likely glassy or offshore.'
      : ''
    const sizeNote = waveHt < 1.5 ? 'Too small for most. Longboard or foil only.' : waveHt > 8 ? 'Dangerously large — experts only.' : ''
    return `${offshore!.waveHeight} ft${pd}${quality ? ` · ${quality}` : ''}. ${advice}${windNote}${sizeNote ? ' ' + sizeNote : ''}`.trim()
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
    if (waveHt === null && windKt === null) return 'No buoy data — use caution on open water.'
    const wh = waveHt ?? 0; const ws = windKt ?? 0
    const base = [waveHt !== null ? `${offshore!.waveHeight} ft seas` : '', windKt !== null ? `${ws.toFixed(1)} kt wind` : ''].filter(Boolean).join(', ')
    if (wh < 1.5 && ws < 12)
      return `${base} — ideal paddling conditions. Ocean launches comfortable; all skill levels can head out.`
    if (wh < 3 && ws < 18)
      return `${base} — open water manageable for intermediate paddlers. ICW and inlets recommended for beginners. Watch for afternoon wind chop.`
    return `${base} — open water unsafe for most kayaks and SUPs. Stay in the ICW, inlets, or sheltered bays only.`
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
    if (waveHt === null && windKt === null) return 'No buoy data — check NWS marine forecast before heading out.'
    const wh = waveHt ?? 0; const ws = windKt ?? 0
    const base = [waveHt !== null ? `${offshore!.waveHeight} ft seas` : '', windKt !== null ? `${ws.toFixed(1)} kt wind` : ''].filter(Boolean).join(', ')
    if (wh < 2 && ws < 15)
      return `${base} — comfortable offshore run. Reefs and wrecks accessible. Good day for inshore and offshore fishing.`
    if (wh < 4 && ws < 20)
      return `${base} — manageable in vessels 20 ft+. Small craft use caution. Inshore reefs and nearshore wrecks fishable; offshore may be bumpy.`
    return `${base} — small craft advisory conditions likely. Offshore not recommended. Inshore inlets and nearshore reefs only; secure all gear.`
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
  const beachDetail = (() => {
    if (beachWave === null) return 'No buoy data — check local beach conditions.'
    const ws = windKt ?? 0
    if (beachWave < 2)
      return `${beachWave.toFixed(1)} ft offshore — calm shore break, safe swimming. Low rip current risk. Great for families and snorkeling.`
    if (beachWave < 3.5)
      return `${beachWave.toFixed(1)} ft offshore — moderate shore break with possible rip currents. Swim near lifeguard towers; heed flag warnings.`
    return `${beachWave.toFixed(1)} ft offshore${ws > 18 ? `, ${ws.toFixed(1)} kt wind` : ''} — rough shore break and high rip current risk. Flag conditions likely Red. Avoid swimming; wading only with extreme caution.`
  })()

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
