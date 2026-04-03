import { BuoyData } from '@/lib/noaa'
import BHBGuideCard from '@/components/BHBGuideCard'

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

  const offshore = byId('41122') ?? byId('41009')
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
    if (waveHt === null && windKt === null) return 'No buoy data available. Check with your local dive operator before entering the water.'
    const wh = waveHt ?? 0
    const ws = windKt ?? 0
    const seas = waveHt !== null ? `${offshore!.waveHeight} ft seas` : ''
    const wind = windKt !== null ? `${ws.toFixed(1)} kt wind` : ''
    const base = [seas, wind].filter(Boolean).join(', ')
    if (wh < 1.5 && ws < 12)
      return `${base}. Shore entry sites like Blue Heron Bridge should have minimal surge and good water movement. Boat dives running smoothly at all depths. Good conditions for photography, macro work, and extended bottom time. Confirm viz locally before diving.`
    if (wh < 2.5 && ws < 20)
      return `${base}. Manageable for experienced divers. Expect light surge at shore entry sites; plan your entry and exit carefully. Boat dives comfortable but nearshore viz may be reduced from water movement. Beginners should dive with a guide or wait for calmer conditions. Verify with your operator.`
    return `${base}. Strong surge expected at all shore entry sites. BHB and similar spots not recommended today. Boat dives with an experienced captain only; nearshore viz likely poor from stirred-up sediment. If you must dive, go deeper and farther offshore. Confirm with your operator.`
  })()

  // ── Surfing ───────────────────────────────────────────────────
  // Period is the primary quality indicator — height alone is not enough
  const surfRating: Rating = (() => {
    if (waveHt === null) return 'N/A'
    if (waveHt < 1.5) return 'Small'
    if (waveHt < 2.5) return 'Poor'
    if (waveHt > 8)   return 'Rough'
    // 2.5–8 ft: period determines quality
    if (wavePd !== null) {
      if (wavePd >= 12) return 'Good'     // long-period groundswell, clean lines
      if (wavePd >= 8)  return 'Marginal' // moderate period, some shape
      return 'Poor'                       // short period wind chop, messy and steep
    }
    return 'Marginal' // no period data — be conservative
  })()
  const surfDetail = (() => {
    if (waveHt === null) return 'No buoy data available. Check local surf reports or webcams before heading out.'
    const ht  = offshore!.waveHeight
    const pd  = wavePd !== null ? ` @ ${offshore!.wavePeriod}s` : ''
    if (waveHt < 1.5)
      return `${ht} ft${pd}. Too small for most surfers. Longboard or foil only; expect slow, crumbling sections with little push. Check Sebastian Inlet or southeast-facing beaches for any bump.`
    if (waveHt < 2.5)
      return `${ht} ft${pd}. Waves are present but weak and inconsistent. Longboards and high-volume boards only. Space Coast jetties and Sebastian Inlet are your best bet for any shape today.`
    if (waveHt > 8)
      return `${ht} ft${pd}. Dangerously large. Experts only, and only those who know the specific break. Paddle-out may be impossible at most spots.`
    // 2.5–8 ft range
    if (wavePd !== null && wavePd >= 12)
      return `${ht} ft${pd} — long-period groundswell. Clean, punchy lines with good shape; this is what South Florida surfers wait for. ESE and SE swells wrap best at Space Coast jetties and Sebastian Inlet. All skill levels, most board types. Early morning before sea breeze is ideal.`
    if (wavePd !== null && wavePd >= 8)
      return `${ht} ft${pd} — moderate period, some texture. Rideable for intermediate surfers with work. A mid-length or step-up will feel more comfortable than a shortboard in the mushier sections. Wind direction matters today; get out early before sea breeze adds chop to the face.`
    return `${ht} ft${pd} — short-period wind chop. Waves are steep, closing out fast, and difficult to read. Not worth paddling out unless you just want water time on a high-volume board. Space Coast generally holds shape better than Gold Coast in these conditions. Check back once wind eases.`
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
    if (waveHt === null && windKt === null) return 'No buoy data available. Use caution on open water and stay close to shore.'
    const wh = waveHt ?? 0
    const ws = windKt ?? 0
    const base = [waveHt !== null ? `${offshore!.waveHeight} ft seas` : '', windKt !== null ? `${ws.toFixed(1)} kt wind` : ''].filter(Boolean).join(', ')
    if (wh < 1.5 && ws < 12)
      return `${base}. Ideal paddling conditions. Ocean launches easy from any beach access and the ICW is flat and calm. All skill levels can head out safely. Good day for open-ocean crossings or distance training. Watch for sea breeze picking up around 1–2 pm.`
    if (wh < 3 && ws < 18)
      return `${base}. Open water manageable for intermediate to advanced paddlers. Beginners and recreational SUP riders should stay in the ICW or sheltered bays today. If launching ocean-side, stay close to shore and be aware of current at inlet mouths. Plan to be off the water before afternoon wind builds.`
    return `${base}. Open water unsafe for kayaks and SUPs. Stick to the ICW, intracoastal, or protected lagoons only. Even experienced paddlers should avoid ocean launches — strong wind and steep chop make self-rescue difficult if you capsize. Find a river or bay with land buffers on the windward side.`
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
    if (waveHt === null && windKt === null) return 'No buoy data available. Check NWS marine forecast before heading out.'
    const wh = waveHt ?? 0
    const ws = windKt ?? 0
    const base = [waveHt !== null ? `${offshore!.waveHeight} ft seas` : '', windKt !== null ? `${ws.toFixed(1)} kt wind` : ''].filter(Boolean).join(', ')
    if (wh < 2 && ws < 15)
      return `${base}. Comfortable offshore run. Reefs, wrecks, and the Gulf Stream all accessible. Good day for pushing to the 100–150 ft bottom or running to the Stream. Check tide timing at your inlet — even on calm days, an ebbing tide against wind can kick up chop at the mouth.`
    if (wh < 4 && ws < 20)
      return `${base}. Manageable for vessels 20 ft and up. Small craft use caution offshore; nearshore reefs and wrecks in the 60–80 ft range are fishable. Expect a bumpy return if afternoon wind builds. Inshore and inlet fishing fine for most boats. Secure all loose gear before heading out.`
    return `${base}. Small craft advisory conditions likely. Offshore not recommended for most vessels. Inlets can be dangerous on an outgoing tide against this wind. Stick to inshore reefs, nearshore wrecks, and protected bays. If you go out, stay inside the reef line and run with a buddy boat. Check NWS marine forecast before departure.`
  })()

  // ── Beach / Swimming ──────────────────────────────────────────
  const beachBuoy = keys ?? offshore
  const beachWave = n(beachBuoy?.waveHeight) ?? waveHt
  const beachRating: Rating = (() => {
    if (beachWave === null) return 'N/A'
    if (beachWave < 2)   return 'Good'
    if (beachWave < 3.5) return 'Marginal'
    return 'Rough'
  })()
  const beachDetail = (() => {
    if (beachWave === null) return 'No buoy data available. Check with a local lifeguard before swimming.'
    const ws = windKt ?? 0
    if (beachWave < 2)
      return `${beachWave.toFixed(1)} ft offshore. Calm shore break with safe swimming conditions and low rip current risk. Great for families, young swimmers, and snorkeling off the beach. Green or yellow flag expected at most lifeguarded beaches. Check local flag status before entering the water.`
    if (beachWave < 3.5)
      return `${beachWave.toFixed(1)} ft offshore. Moderate shore break with possible rip currents. Manageable for strong swimmers but can catch casual beachgoers off guard. Swim near lifeguard towers and obey flag warnings. If caught in a rip, swim parallel to shore until free, then angle back in. Yellow flag expected at most beaches.`
    return `${beachWave.toFixed(1)} ft offshore${ws > 18 ? `, ${ws.toFixed(1)} kt wind` : ''}. Rough shore break with high rip current risk. Red or purple flag conditions likely at most beaches. Avoid swimming beyond waist depth; strong undertow possible near inlets. Excellent day for a beach walk, but keep children out of the water. Check with lifeguards before entering.`
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
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {verdicts.map(({ activity, icon, rating, detail }) => (
          <div key={activity} className="bg-slate-800 rounded-2xl p-4 shadow-lg flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">{icon}</span>
              <span className="text-white font-medium text-sm">{activity}</span>
            </div>
            <span className={`self-start px-2.5 py-1 rounded-full text-xs font-bold ${ratingStyle[rating]}`}>
              {rating}
            </span>
            <p className="text-slate-400 text-xs leading-relaxed">{detail}</p>
          </div>
        ))}
        <BHBGuideCard />
      </div>
    </section>
  )
}
