import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { Resend } from 'resend'
import { createHmac } from 'crypto'
import { fetchAllBuoys, fetchMarineForecast, fetchUVIndex, fetchCurrents, fetchWeatherOutlook } from '@/lib/noaa'
import { getSunTimes } from '@/lib/sun'

export const maxDuration = 300

// Issue #1 launched March 17 2026
const LAUNCH_DATE = new Date('2026-03-17T00:00:00-04:00')

const REGIONS: { name: string; buoyId: string; decommissioned?: string }[] = [
  { name: 'Space Coast (Cocoa Beach / Sebastian)', buoyId: '41009' },
  { name: 'Treasure Coast (Vero / Ft Pierce)',      buoyId: '41114' },
  { name: 'Blue Heron Bridge',                     buoyId: 'LKWF1' },
  { name: 'Palm Beach / Singer Is.',               buoyId: 'LKWF1' },
  { name: 'Deerfield / Pompano',                   buoyId: '41122' },
  { name: 'Fort Lauderdale',                       buoyId: '41122' },
  { name: 'Miami / Key Biscayne',                  buoyId: '41122' },
  // MLRF1 (Molasses Reef) was decommissioned 2023-02-28 — no replacement buoy for Upper Keys
  { name: 'Key Largo / Upper Keys',                buoyId: 'MLRF1', decommissioned: 'MLRF1 decommissioned Feb 2023, no replacement — Upper Keys has no buoy coverage' },
  { name: 'Marathon / Middle Keys',                buoyId: 'SMKF1' },
  { name: 'Key West / Lower Keys',                 buoyId: '42095' },
]

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY
    const githubToken  = process.env.GITHUB_TOKEN
    const resendKey    = process.env.RESEND_API_KEY
    if (!anthropicKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 503 })
    if (!githubToken)  return NextResponse.json({ error: 'GITHUB_TOKEN not set' }, { status: 503 })
    if (!resendKey)    return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 503 })

    // Date + issue number
    const now = new Date()
    const etDate = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const etLong = now.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    const etShort = now.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric' })
    const msPerDay = 86400000
    const issueNumber = Math.max(1, Math.floor((now.getTime() - LAUNCH_DATE.getTime()) / msPerDay) + 1)

    // Dedup guard: skip if today's draft already exists in GitHub (prevents double-send)
    const draftPath = `drafts/${etDate}-ghost.html`
    const draftCheck = await fetch(`https://api.github.com/repos/thefloridaflow/The-Florida-Flow/contents/${draftPath}`, {
      headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github+json' },
    })
    if (draftCheck.ok) {
      return NextResponse.json({ skipped: true, reason: `Already sent for ${etDate} — draft exists at ${draftPath}` })
    }

    // Fetch all data in parallel
    const appBase = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.thefloridaflow.com').replace('https://thefloridaflow.com', 'https://www.thefloridaflow.com')
    const [buoys, forecast, uv, current, outlook, operatorRes, bhbRes] = await Promise.all([
      fetchAllBuoys(),
      fetchMarineForecast(),
      fetchUVIndex(),
      fetchCurrents(),
      fetchWeatherOutlook(),
      fetch(`${appBase}/api/operator-logs`, { signal: AbortSignal.timeout(10000) }).then(r => r.json()).catch(() => []),
      fetch(`${appBase}/api/bhb-tides`,     { signal: AbortSignal.timeout(10000) }).then(r => r.json()).catch(() => []),
    ])

    const byId = Object.fromEntries(buoys.map((b: { stationId: string }) => [b.stationId, b]))

    // Build buoy summary for each region
    const buoySummary = REGIONS.map(({ name, buoyId, decommissioned }) => {
      if (decommissioned) return `${name}: NO COVERAGE — ${decommissioned}`
      const b = byId[buoyId] as { waveHeight?: string; wavePeriod?: string; waterTemp?: string; windSpeed?: string; windDir?: string; error?: string; offshoreNm?: number } | undefined
      if (!b || b.error) return `${name}: no data available`
      const parts = []
      if (b.waveHeight)  parts.push(`seas ${b.waveHeight} ft`)
      if (b.wavePeriod)  parts.push(`${b.wavePeriod}s period`)
      if (b.windSpeed)   parts.push(`wind ${b.windSpeed} kt ${b.windDir ?? ''}`.trim())
      if (b.waterTemp)   parts.push(`water ${b.waterTemp}°F`)
      const tag = (b.waveHeight || b.windSpeed) ? '[OBSERVED buoy]' : '[no wave data]'
      return `${name}: ${parts.join(', ')} ${tag} — buoy ${buoyId}${b.offshoreNm ? ` (${b.offshoreNm} nm offshore)` : ''}`
    }).join('\n')

    // Operator logs
    interface OperatorReport {
      operator: string
      location: string
      date: string
      visibility?: string
      current?: string
      waterTemp?: string
      waves?: string
      notes?: string
      url: string
      linkOnly?: boolean
      error?: boolean
    }
    const operators: OperatorReport[] = Array.isArray(operatorRes) ? operatorRes : []
    const operatorSummary = operators.filter(o => !o.linkOnly && !o.error && o.date).map(o => {
      const parts = [`${o.operator} (${o.location}) — ${o.date}`]
      if (o.visibility) parts.push(`Viz: ${o.visibility}`)
      if (o.waterTemp)  parts.push(`Temp: ${o.waterTemp}`)
      if (o.current)    parts.push(`Current: ${o.current}`)
      if (o.waves)      parts.push(`Waves: ${o.waves}`)
      if (o.notes)      parts.push(`Notes: "${o.notes}"`)
      return parts.join(' | ')
    }).join('\n') || 'No operator reports scraped today.'

    // BHB windows
    interface BHBTide { time: string; height: string; quality: string; windowStart: string; windowEnd: string }
    interface BHBDay  { label: string; tides: BHBTide[] }
    const bhbDays: BHBDay[] = Array.isArray(bhbRes) ? bhbRes : []
    const bhbSummary = bhbDays.map(d =>
      `${d.label}: ` + d.tides.map(t => `${t.time} (${t.height} ft) ${t.quality} | window ${t.windowStart}–${t.windowEnd}`).join('; ')
    ).join('\n') || 'No BHB window data.'

    // UV
    const uvSummary = `UV today: ${uv.uvIndex} (${uv.uvIndex >= 8 ? 'Very High — UV Alert' : uv.uvIndex >= 6 ? 'High' : uv.uvIndex >= 3 ? 'Moderate' : 'Low'}), tomorrow: ${uv.uvIndexTomorrow}`

    // Currents
    const currentSummary = current.error ? 'Port Everglades current: unavailable' : `Port Everglades current: ${current.speed} kt ${current.direction}`

    // Sun times (Palm Beach area, lat 26.713 lon -80.057)
    const { sunrise, sunset } = getSunTimes(now, 26.713, -80.057)
    const fmtET = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' })
    const goldenMorningEnd   = new Date(sunrise.getTime() + 45 * 60000)
    const goldenEveningStart = new Date(sunset.getTime()  - 45 * 60000)
    const sunSummary = `Sunrise: ${fmtET(sunrise)} | Morning golden hour: ${fmtET(sunrise)}–${fmtET(goldenMorningEnd)} | Evening golden hour: ${fmtET(goldenEveningStart)}–${fmtET(sunset)} | Sunset: ${fmtET(sunset)}`

    const anthropic = new Anthropic({ apiKey: anthropicKey })

    // Build weather outlook summary from real Open-Meteo data
    const tonightStr = outlook.tonightHourly.length
      ? outlook.tonightHourly.map(h => `  ${h.time}: wind ${h.windKt}kt, gusts ${h.windGustKt}kt, ${h.precipProb}% precip`).join('\n')
      : '  (no hourly data)'
    const dailyStr = outlook.daily.slice(0, 6).map(d =>
      `  ${d.label}: ${d.summary}, wind max ${d.windMaxKt}kt, gusts ${d.windGustMaxKt}kt, ${d.precipProbMax}% precip chance, ${d.precipMm}mm rain`
    ).join('\n')

    const specialContext = `=== 7-DAY WEATHER OUTLOOK (Open-Meteo, Palm Beach — knots) ===
Tonight (${etLong.split(',')[0]}):
${tonightStr}

Days ahead:
${dailyStr}

INSTRUCTION: Read this data alongside the NWS marine forecast below and lead with whatever is most significant and actionable. If conditions are building or a front is approaching, make that the central story. If it is a calm week, reflect that instead. Do not invent weather events — only describe what the numbers actually show.`

    const socialPrompt = `You are writing social media posts for The Florida Flow, a free South Florida ocean conditions app and daily newsletter. Voice: knowledgeable local, short sentences, real talk. NEVER use em dashes anywhere. Use a comma or period instead.

TODAY IS ${etLong}.

=== LIVE BUOY DATA ===
${buoySummary}

=== BHB DIVE WINDOWS ===
${bhbSummary}

=== NWS MARINE FORECAST ===
${forecast.forecast?.slice(0, 1800) || 'Unavailable'}

=== DATA RULES ===
- Buoy data (seas, water temp, wind) = live. Use freely.
- BHB dive windows = live. Use exact times and quality ratings from the data above.
- NWS forecast = current. Use it.
- Operator reports = IGNORE unless dated ${etShort} or ${new Date(Date.now() - 86400000).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric' })}. If older, pretend they don't exist.
- You have NO live visibility data. NEVER mention viz or water clarity.

=== HOOK MASTERY (the only thing that determines if someone stops scrolling) ===

WINNING HOOK FORMULAS — pick the one that fits today's data best:

A. GEOGRAPHY CONTRAST: Two locations with meaningfully different numbers. Name both.
   Strong: "Space Coast is running 4 ft this morning. Blue Heron Bridge is dead calm. Same state, different planet."
   Weak: "Conditions vary across South Florida today."

B. NUMBER WITH CONTEXT: A specific reading that means something once you explain it.
   Strong: "79°F water at Molasses Reef. That's the warmest it gets before jellyfish season starts showing up."
   Weak: "Water temps are warm today."

C. COUNTERINTUITIVE FACT: Flip what people assume. Make them feel like an insider for learning it.
   Strong: "The choppiest water in South Florida right now isn't offshore. It's inshore at the Treasure Coast."
   Weak: "Offshore conditions are rough."

D. WAVE PERIOD EDUCATION (X/Twitter only): Period tells you more than height. Use it.
   Strong: "2 ft at 10 seconds is a completely different ocean than 2 ft at 5 seconds. Today buoy 41009 is showing [X]s. Here's what that means."
   Weak: "Waves are 2 ft today."

E. STAKES FOR THIS SPECIFIC AUDIENCE: What goes wrong if they don't have this info.
   Scuba: "BHB tidal window closes at [time]. After that the viz drops fast and the current picks up. Plan accordingly."
   Fishing: "Water dropped 3°F overnight at the Keys buoy. That temp shift moves the fish. Worth checking before you leave the dock."
   Beach: "Wind is onshore at 18 kt right now. That flag is going to be yellow at minimum. Check before you drive."

F. INSIDER SIGNAL: Something only someone who actually watches this data every day would say.
   Strong: "When the Treasure Coast buoy shows NE wind at 15+ kt this time of year, it usually means the Gulf Stream has pushed closer in. Warmer water, better color."
   Weak: "Northeast winds today."

G. TENSION QUESTION: A real question with a surprising answer baked in.
   Strong: "Why is Fort Lauderdale showing 4 ft while the Keys show 1 ft right now? It's not a storm — it's the angle of the swell."
   Weak: "Wondering what conditions are like today?"

FORBIDDEN OPENERS (never start a post with these):
"Water temps are..." / "Conditions are..." / "Good morning..." / "Today's update..." / "Here's what's happening..." / "South Florida ocean conditions..." / "The Florida Flow is..." / "Checking in with..." / "Happy [day]..." / "Quick update..."

HOOK RULES:
- The hook is a complete thought. It stands alone. No cliffhangers that require clicking to understand.
- Use the most surprising or actionable number from today's data. Not the most average one.
- Specificity builds trust. "79°F" beats "warm." "4 ft at 7 seconds" beats "choppy."
- If today's data is genuinely unremarkable, use the forecast to find the tension (incoming weather, building swell, wind shift).

${specialContext}

=== INSTRUCTIONS ===
Write 5 posts separated by exactly "---" on its own line.

POST 1 — X (Twitter) thread. 3 tweets separated by [TWEET].
- Purpose: make the most interesting number from today's buoy data impossible to ignore.
- Tweet 1 (≤260 chars): Lead with the single most striking data point or contrast. Use formula A, B, C, D, or G. End with 🧵
- Tweet 2 (≤270 chars): Regional breakdown — Space Coast / Treasure Coast / Gold Coast / Keys. Seas ft + water temp °F + wind kt. Buoy distance in parens. Numbers only, no filler words.
- Tweet 3 (≤240 chars): The ONE forecast detail that matters most today (incoming weather, wind shift, building swell, small craft advisory). End with: thefloridaflow.com
- No hashtags. Zero em dashes. "Glassy" only if winds <5 kt. No other condition adjectives unless buoy numbers directly support them.

POST 2 — Facebook (Scuba/Diving groups). 100-150 words.
- Audience: divers in South Florida Facebook groups. They dive BHB, local reefs, offshore wrecks. They know tides matter.
- Purpose: one piece of immediately useful intel, then the app link.
- Hook (MANDATORY): use Formula E — open with the BHB window time and close time from the BHB data. Example strong hook: "BHB morning window opens at 8:46 AM and runs until 9:46 AM — 20 kt ENE wind and 76°F water at the inshore buoy." If no BHB window today, use Formula A (two regions with meaningfully different sea state or temp, named explicitly).
- Body: BHB window quality from BHB data (good/fair/poor and why — tide height and wind). Water temp for 2-3 regions. Sea state in ft. One sentence on Port Everglades current direction if available. Buoy data only — no viz predictions, no operator reports.
- NEVER make judgment calls. Forbidden: "morning dives are your play," "good day to dive," "avoid," "recommend," or any opinion on whether to go. State the numbers. Let the diver decide.
- End with: "Verify with your operator or divemaster. Full conditions + dive windows at thefloridaflow.com — free newsletter every morning."
- No hashtags. No em dashes. Tone: local diver who checks the data every morning, sharing what they see.

POST 3 — Facebook (General Florida / beach groups). 100-140 words.
- Audience: families, tourists, casual swimmers and beachgoers. They check the weather app, see sun, and drive to the beach. They do not know what a swell period is.
- Purpose: tell them what they need to know before they load up the car — and get them to bookmark the app.
- Hook: use formula A, B, or E (beach version). Speak to the experience, not the numbers.
- Body (plain English only — no buoy IDs, no wave periods, no jargon):
  * Water temp as a feeling (give the number; add "comfortable" if >78°F, "cool" if <74°F)
  * Sea state in one word (calm / mild chop / rough)
  * Rip current risk: derive from wave height + period. Short period (<8s) + 2ft+ = elevated risk. Say "rip current risk is elevated today" or "low rip current risk" based on the data. If elevated, add "swim near a lifeguard stand."
  * Flag color estimate (unofficial): <2ft + <10kt = likely green; 2-3ft or 10-20kt = likely yellow; 3ft+ or >20kt = likely red. Say "expect [color] flags" and note it is an estimate.
  * One sentence on best time of day if wind/tide makes morning or afternoon meaningfully better.
- End with: "Daily beach and ocean conditions at thefloridaflow.com — free."
- No hashtags. No em dashes. Two short paragraphs max.

POST 4 — Facebook (Fishing groups). 80-120 words.
- Audience: offshore, inshore, bridge, and pier fishers. They know their boats and their limits.
- Purpose: give them the numbers they need for a go/no-go decision, and get them to the app for tides and currents.
- Hook: use formula B, E (fishing version), or F. Water temp with species context is high-value (e.g., "74°F at the Keys buoy — that's the edge of where mahi start moving in"). Sea state for getting out. Wind direction matters.
- Body: seas and water temp by region. That is all. No judgment on where to fish. Fishermen decide that.
- Water temp species context you can use: >80°F = peak mahi/wahoo season offshore; 75-80°F = mahi present, kingfish active; 70-75°F = kingfish, cobia moving; <70°F = snook, redfish, sheepshead inshore bite picks up.
- End with: "Tides, currents, and full conditions at thefloridaflow.com — free daily newsletter."
- No hashtags. No em dashes. Two short paragraphs max.

POST 5 — Reddit. 100-140 words.
- Audience: r/scubadiving, r/Florida, r/spearfishing, or r/FishingFlorida — pick the most relevant for today's data.
- Purpose: genuine useful community post that happens to mention the app. Must not read like an ad.
- Framing: you track this data daily and here's what you're seeing today. Lead with the most interesting or actionable data point. Make it useful even if they never click.
- Hook: use formula C, D, F, or G. Redditors reward specificity and penalize marketing speak.
- After the data, include one sentence naturally explaining what The Florida Flow is and why it was built. Example: "I built The Florida Flow because there was no single place that pulled buoy data, tides, and dive windows together for South Florida — so I made it." Keep it human, not a pitch.
- One natural mention of the app near the end. No hard sell.
- Suggest the subreddit in brackets at the top: [r/subreddit]
- Tone: local who actually dives or fishes, not a content creator.
- End with: "full data at thefloridaflow.com if useful"`

    const ghostPrompt = `Generate the HTML email for Issue #${issueNumber}, ${etLong}. Output COMPLETE self-contained HTML starting with font <link> tags and ending with the closing wrapper div. ALL styles must be inline. No external CSS classes.

${specialContext}

DATA (use only this):
BUOYS: ${buoySummary}
OPERATORS: ${operatorSummary}
BHB WINDOWS: ${bhbSummary}
UV: ${uvSummary} | CURRENTS: ${currentSummary} | SUN: ${sunSummary}
FORECAST: ${forecast.forecast?.slice(0, 1400) || 'Unavailable'}

RULES: Data only. No judgment calls. Offshore buoys (20-60nm) ≠ nearshore. Cite buoy distance. Plain English (no NWS jargon). NEVER use em dashes (—) anywhere. Use a comma, period, or colon instead.

RATING SCALE: CALM <1ft/<10kt | GOOD 1-3ft/<15kt | CHOPPY 3-4ft/short period | ELEVATED 3-5ft/building or 15-20kt | BUILDING worsening trend | ROUGH 5ft+/>25kt | ACTIVE SCA named advisory
South FL context: 2-3 ft seas are NORMAL and comfortable here. NW/W winds (offshore) improve vis; E/NE (onshore) worsen it. Narrow shelf means offshore buoys closely reflect nearshore.

VIS MODEL (PREDICTED unless operator confirms): <1ft+<10kt=40-80ft | 1-2ft+<15kt=20-50ft | 2-3ft+NW/W wind=20-50ft | 2-3ft+E/NE wind=10-30ft | 3-5ft/>20kt=5-15ft | >5ft=<10ft. BHB="Tidal 5-20ft".
PERIOD CORRECTION: wave period >=9s: reduce vis one tier (long rollers stir sediment). period <=5s + height <2ft: note "surface chop, bottom less affected."

DESIGN SYSTEM — "chart" theme, editorial light style. Apply ALL styles inline.

START your output with these font imports (before wrapper div):
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,300..900;1,8..60,300..900&family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">

COLOR TOKENS (hardcoded hex — no CSS variables):
PAPER=#eef6f6 | PAPER2=#deedee | RULE=#b8d4d4 | RULE2=#96bfbf
INK=#1a2035 | INK2=#323855 | INK3=#5a6285 | INK4=#8890a8
ACCENT=#2646c8 | ACCENT_SOFT=#cdd9f0
GOOD=#2a8a58 | GOOD_SOFT=#d0f0e0
WARN=#b87820 | WARN_SOFT=#f5e8c8
DANGER=#b02818 | DANGER_SOFT=#f5d4cc

FONT STACKS:
SERIF="Source Serif 4",Georgia,serif
SANS="Inter Tight",-apple-system,BlinkMacSystemFont,Arial,sans-serif
MONO="JetBrains Mono",ui-monospace,SFMono-Regular,monospace

WRAPPER (outermost div):
<div style="max-width:720px;margin:0 auto;background:#eef6f6;border:1px solid #b8d4d4;font-family:'Inter Tight',-apple-system,BlinkMacSystemFont,Arial,sans-serif;color:#1a2035;">

SECTION HEADER pattern (use for each named section):
<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:18px;border-bottom:1px solid #96bfbf;padding-bottom:10px;">
  <h3 style="font-family:'Source Serif 4',Georgia,serif;font-weight:400;font-size:22px;letter-spacing:-0.01em;margin:0;color:#1a2035;">[Title] <em style="font-style:italic;">[italic part]</em></h3>
  <span style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#5a6285;">[meta]</span>
</div>

SECTION WRAPPER: <section style="padding:28px;border-top:1px solid #b8d4d4;">

OUTPUT all sections inside the wrapper div in this order:

1. MASTHEAD (always first):
<header style="padding:28px 28px 20px;border-bottom:2px solid #1a2035;">
  Kicker row (flex, space-between): <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:20px;font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:0.14em;text-transform:uppercase;color:#5a6285;padding-bottom:14px;border-bottom:1px solid #b8d4d4;margin-bottom:18px;">
    Left: <span><b style="color:#1a2035;">[Weekday]</b> · [Date full] · Issue #${issueNumber}</span>
    Right: <span>thefloridaflow.com</span>
  </div>
  Wordmark: <h1 style="font-family:'Source Serif 4',Georgia,serif;font-weight:300;font-style:italic;font-size:48px;line-height:0.95;letter-spacing:-0.02em;color:#1a2035;margin:0 0 14px;">The Florida Flow.</h1>
  Tagline: <p style="font-family:'Source Serif 4',Georgia,serif;font-size:15px;font-style:italic;color:#5a6285;margin:0;">The morning briefing for divers, anglers, and everyone on the water — Space Coast to Key West.</p>
</header>

2. VERDICT STRIP (4 key metrics in a row, always include):
<div style="display:grid;grid-template-columns:1.2fr 1fr 1fr 1fr;border-bottom:2px solid #1a2035;">
  Each cell: <div style="padding:14px 20px;border-right:1px solid #b8d4d4;"> (last cell: no border-right)
    Label: <div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:0.14em;text-transform:uppercase;color:#5a6285;margin-bottom:6px;">[LABEL]</div>
    Value: <div style="font-family:'Source Serif 4',Georgia,serif;font-size:20px;font-weight:500;line-height:1.1;color:#1a2035;">[value] <small style="font-family:'Inter Tight',Arial,sans-serif;font-size:11px;font-weight:500;color:#5a6285;display:block;margin-top:3px;">[sub]</small></div>
  Columns: "Today's Call" (one sharp verdict sentence + status pill) | "Best Window" (BHB time if viable, else best activity window) | "Seas Now" (nearest buoy height) | "Water" (temp + buoy ID)
  STATUS PILL: <span style="display:inline-block;font-family:'Inter Tight',Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;padding:2px 7px;margin-top:6px;border-radius:2px;background:[GOOD_SOFT|WARN_SOFT|DANGER_SOFT];color:[GOOD|WARN|DANGER];">[label]</span>

3. ALERT BAR (always include — pick ONE based on conditions, never omit):
  DANGER (active NWS advisory OR seas 5ft+ OR waterspouts): background:#f5d4cc;border-left:4px solid #b02818 — layout: flex with 44px badge + content
    Badge: <div style="width:44px;flex-shrink:0;border:1.5px solid #b02818;color:#b02818;font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:600;letter-spacing:0.08em;text-align:center;padding:8px 4px;line-height:1.3;">⚠<br>[TYPE]</div>
    Title: font-family:'Source Serif 4',Georgia,serif;font-size:22px;font-weight:500;line-height:1.2;margin:0 0 4px;color:#1a2035 (em tags for italic emphasis in danger color)
    Sub: font-family:'Inter Tight',Arial,sans-serif;font-size:13.5px;color:#323855;margin:0
  WARN (building 4ft+/25kt+ or SCA approaching within 24h): same structure, background:#f5e8c8;border-left:4px solid #b87820;badge in #b87820
  CALM (anything under 4ft/<20kt — DO NOT warn for normal conditions): background:#cdd9f0;border-left:4px solid #2646c8 — no badge. Just: <div style="padding:16px 20px;font-family:'Source Serif 4',Georgia,serif;font-size:16px;font-weight:500;color:#1a2035;line-height:1.4;"> lead with best opportunity of the day
  Alert wrapper: <div style="padding:18px 20px;border-bottom:1px solid #b8d4d4;display:flex;gap:16px;align-items:flex-start;[background+border-left];">
  2-3 ft seas with light wind = CALM bar (blue). Never use warn bar for normal South Florida conditions.

4. LEDE (editorial briefing):
<section style="padding:32px 28px 8px;">
  Section mark: <div style="font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:0.14em;text-transform:uppercase;color:#5a6285;display:flex;align-items:center;gap:10px;margin-bottom:18px;"><span style="width:24px;height:1px;background:#5a6285;display:inline-block;flex-shrink:0;"></span>The Briefing</div>
  H2: <h2 style="font-family:'Source Serif 4',Georgia,serif;font-weight:400;font-size:30px;line-height:1.18;letter-spacing:-0.015em;margin:0 0 18px;color:#1a2035;">[Headline with <em style="font-style:italic;">italic key phrase</em>]</h2>
  Paragraphs: <p style="font-family:'Source Serif 4',Georgia,serif;font-size:16.5px;line-height:1.6;color:#323855;margin:0 0 14px;">[body]</p> — 2-3 paragraphs covering buoy readings, forecast, BHB window, front/event context
  BUOY STRIP (after first paragraph, always):
  <div style="margin:22px 0 10px;border:1px solid #b8d4d4;display:grid;grid-template-columns:repeat(4,1fr);">
    Each buoy cell (border-right except last): <div style="padding:10px 12px;border-right:1px solid #b8d4d4;">
      ID: <div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:0.1em;color:#5a6285;text-transform:uppercase;">[buoyId] · [short region]</div>
      Val: <div style="font-family:'Source Serif 4',Georgia,serif;font-size:18px;font-weight:500;color:#1a2035;line-height:1.1;margin-top:3px;">[main value] <small style="font-family:'Inter Tight',Arial,sans-serif;font-weight:500;font-size:10.5px;color:#5a6285;">[unit/secondary]</small></div>
    </div>
  </div>
  BHB GUIDE CARD (after final lede paragraph):
  <a href="https://thefloridaflow.com/guide" style="display:block;margin:22px 0 8px;padding:18px 20px;background:#cdd9f0;border:1px solid #2646c8;border-left:3px solid #2646c8;text-decoration:none;color:#1a2035;">
    <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#2646c8;margin-bottom:4px;">Featured · Dive site guide</div>
    <div style="font-family:'Source Serif 4',Georgia,serif;font-size:20px;font-weight:500;letter-spacing:-0.01em;color:#1a2035;line-height:1.15;margin-bottom:4px;">First time at <em style="font-style:italic;">Blue Heron Bridge?</em></div>
    <div style="font-family:'Source Serif 4',Georgia,serif;font-size:13.5px;color:#323855;line-height:1.5;margin-bottom:14px;">56-page field guide — tide windows, entry points, critter map, offline tables. Everything you need for every dive.</div>
    <div style="display:inline-block;padding:10px 16px;background:#1a2035;color:#eef6f6;font-family:'Inter Tight',Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.02em;">$12 · Get the guide →</div>
  </a>
  App link: <p style="font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#5a6285;margin:16px 0 0;"><a href="https://thefloridaflow.com" style="color:#2646c8;font-weight:500;">thefloridaflow.com</a> — live buoys, tides, dive windows, UV. Updated hourly.</p>
</section>

5. REGIONAL TABLE:
<section style="padding:28px;border-top:1px solid #b8d4d4;">
  [section header: "Regional conditions" / meta: "[N] regions · [N] observed"]
  <table style="width:100%;border-collapse:collapse;font-family:'Inter Tight',Arial,sans-serif;font-size:13px;">
    TH: font-family:'JetBrains Mono',monospace;font-size:9.5px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:#5a6285;text-align:left;padding:8px 10px 8px 0;border-bottom:2px solid #1a2035;white-space:nowrap
    TD: padding:12px 10px 12px 0;border-bottom:1px solid #b8d4d4;vertical-align:top
    Columns: Region / State / Vis / Seas / Wind / Water
    REGION cell: <td><span style="font-family:'Source Serif 4',Georgia,serif;font-size:15px;font-weight:500;color:#1a2035;">[name]</span><small style="display:block;font-family:'JetBrains Mono',monospace;font-size:9.5px;color:#8890a8;letter-spacing:0.06em;margin-top:2px;text-transform:uppercase;">[location · buoyId]</small></td>
    STATE cell: <span style="display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px;vertical-align:middle;background:[#2a8a58|#b87820|#b02818|#8890a8];"></span><span style="font-weight:600;white-space:nowrap;color:[#2a8a58|#b87820|#b02818|#8890a8];">[Good|Choppy|Rough|No data]</span>
    NUM cells: <span style="font-family:'JetBrains Mono',monospace;font-size:12.5px;color:#1a2035;white-space:nowrap;">[value] <span style="color:#8890a8;">[unit]</span></span>
    OBS/PRED tags: <span style="display:inline-block;font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:0.1em;padding:1px 5px;margin-left:4px;text-transform:uppercase;border:1px solid;border-radius:2px;vertical-align:middle;[border-color:#2a8a58;color:#2a8a58 for OBS | border-color:#8890a8;color:#5a6285 for PRED]">OBS|PRED</span>
    8 regions: Space Coast (41009) | Treasure Coast (41114) | Blue Heron Bridge (LKWF1) | Palm Beach/Singer Is. (LKWF1) | Deerfield/Pompano/Miami (41122) | Upper Keys (MLRF1 decommissioned — show "No coverage") | Marathon (SMKF1) | Key West (42095)
  After table: <p style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#5a6285;letter-spacing:0.06em;margin:12px 0 16px;line-height:1.6;">Sources: [list buoys by coastline + distance]. NWS zones. BHB from iDiveFlorida. UV from Open-Meteo. Offshore buoys ≠ nearshore. Confirm with your captain.</p>
  BHB guide inline promo: <div style="background:#d0f0e0;border-left:3px solid #2a8a58;padding:14px 18px;font-family:'Source Serif 4',Georgia,serif;font-size:14px;color:#1a2035;line-height:1.5;">First time at BHB? <a href="https://thefloridaflow.com/guide" style="color:#2a8a58;font-weight:600;">The Florida Flow BHB Site Guide — Get it for $12 →</a></div>

6. ACTIVITY PLANNER (2-column card grid):
<section style="padding:28px;border-top:1px solid #b8d4d4;">
  [section header: "Activity planner" / meta: "[weekday] · [N] activities"]
  <div style="display:grid;grid-template-columns:1fr 1fr;border-top:2px solid #1a2035;border-left:1px solid #b8d4d4;">
    Each card: <div style="border-right:1px solid #b8d4d4;border-bottom:1px solid #b8d4d4;padding:16px 18px;background:#eef6f6;box-shadow:inset 3px 0 0 [#2a8a58 go|#b87820 caution|#b02818 no];">
      Header: <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
        Name: <span style="font-family:'Source Serif 4',Georgia,serif;font-size:17px;font-weight:500;color:#1a2035;">[Activity]</span>
        Verdict pill: <span style="font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;padding:2px 6px;border-radius:2px;background:[GOOD_SOFT|WARN_SOFT|DANGER_SOFT];color:[GOOD|WARN|DANGER];">[verdict]</span>
      </div>
      Notes: <p style="margin:0;font-size:13px;color:#323855;line-height:1.5;">[notes, end with "verify with your operator"]</p>
    </div>
    6 activities: Scuba | Surfing | Kayak/SUP | Boating/Fishing | Beach | Gulf Stream (use "Do not go" + DANGER when seas 4ft+)
    SCUBA: Good=<3ft+<15kt | Choppy=3-4ft or 15-20kt (most boats still run) | Rough/cancel=4-5ft+ AND onshore 15+kt or 20+kt any. BHB: wind >12-15kt is cancel driver, not wave height.
    SURF OVERRIDE: onshore >=20kt=blown out regardless. Offshore/side-offshore <15kt + period >=8s=upgrade. Never "Good" when onshore >=15kt.
    FISHING: SCA=advise against offshore. 3-5ft manageable large vessels. Inshore generally fine.
    KAYAK/SUP: Good only <2ft+<10kt; above that flag risk clearly.

7. BEACH REPORT:
<section style="padding:28px;border-top:1px solid #b8d4d4;background:#deedee;">
  [section header: "Weekend beach report" / meta: "casual beachgoers · plain English"]
  Plain English only — no buoy IDs, no periods, no jargon.
  - Water temp + feel word ("80°F, comfortable" / "74°F, cool but refreshing")
  - Sea state in one plain word (calm / mild chop / rough / dangerous)
  - Rip risk (NWS model):
    LOW: height <2.3ft OR period <6s OR wind offshore (NW/W/SW)
    ELEVATED: height >=2.3ft AND period 6-10s AND direction shore-normal (NE/E/ENE). If ELEVATED: <strong>Swim near a lifeguard stand.</strong>
    HIGH: height >4ft AND period 6-10s AND onshore, OR height >5ft any period. If HIGH: <strong>Swim near a lifeguard stand.</strong>
  - Flag estimate: Green <2ft+<10kt+no shore-normal swell | Yellow 2-3ft or 10-20kt onshore | Red 3ft++onshore or >20kt any
    <p>"Expect [color] flags (estimate from NOAA data — check posted flags on arrival)."</p>
  - Best time window (morning vs afternoon if meaningfully different, else omit)
  - <p>"Conditions change — always check posted flags and swim near a lifeguard."</p>

8. BHB DIVE WINDOWS:
<section style="padding:28px;border-top:1px solid #b8d4d4;">
  [section header: "Blue Heron Bridge dive windows" / meta: "Inshore · LKWF1 [wind]"]
  Tide readout (4-col): <div style="border:1px solid #b8d4d4;background:#deedee;display:grid;grid-template-columns:repeat(4,1fr);margin-bottom:14px;">
    Each cell (border-right except last): padding:10px 14px
      Label: font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:0.12em;text-transform:uppercase;color:#5a6285;margin-bottom:4px
      Value: font-family:'Source Serif 4',Georgia,serif;font-size:18px;font-weight:500;color:#1a2035;letter-spacing:-0.01em
    Show: High Tide / Low Tide / Best Window / Quality
  Window list (3-col): <div style="display:grid;grid-template-columns:repeat(3,1fr);border:1px solid #b8d4d4;">
    Each window: <div style="padding:12px 14px;border-right:1px solid #b8d4d4;background:[#cdd9f0 if optimal else #eef6f6];[box-shadow:inset 0 2px 0 #2646c8 if optimal];">
      Time: font-family:'Source Serif 4',Georgia,serif;font-size:20px;font-weight:500;color:#1a2035
      Meta: font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:0.08em;text-transform:uppercase;color:#5a6285;margin-top:4px
      Quality: <span style="display:inline-block;padding:1px 5px;border-radius:2px;font-size:9px;font-family:'JetBrains Mono',monospace;background:[GOOD_SOFT|WARN_SOFT];color:[GOOD|WARN];">Optimal|Fair</span>
  Add 1-2 sentence BHB note on vis and wind status.

9. MARINE LIFE SIGHTINGS:
<section style="padding:28px;border-top:1px solid #b8d4d4;">
  [section header: "Yesterday underwater" / meta: "[N] operator reports · [date]"]
  <div style="display:flex;flex-direction:column;gap:0;">
    Each sighting: <div style="display:grid;grid-template-columns:110px 1fr;gap:16px;padding-bottom:14px;border-bottom:1px solid #b8d4d4;[padding-top:14px for 2nd+]">
      Operator: <div><span style="font-family:'Source Serif 4',Georgia,serif;font-size:15px;font-weight:500;color:#1a2035;">[name]</span><small style="display:block;font-family:'JetBrains Mono',monospace;font-size:9.5px;color:#8890a8;letter-spacing:0.08em;text-transform:uppercase;margin-top:4px;">[location]</small></div>
      Body: <div><q style="display:block;font-family:'Source Serif 4',Georgia,serif;font-style:italic;font-size:15.5px;color:#1a2035;padding-left:14px;border-left:2px solid #2646c8;line-height:1.45;margin-top:0;">[quote]</q>
        Stats: <div style="display:flex;gap:18px;margin-top:8px;font-family:'JetBrains Mono',monospace;font-size:11px;color:#5a6285;letter-spacing:0.06em;flex-wrap:wrap;"><span><b style="color:#1a2035;">[value]</b> vis</span><span><b style="color:#1a2035;">[temp]</b> water</span>...</div>
      </div>
  If Rainbow Reef has no data say so by name.

10. WEEK OUTLOOK:
<section style="padding:28px;border-top:1px solid #b8d4d4;">
  [section header: "The week ahead" / meta: "Wind kt · [date range]"]
  <div style="display:grid;grid-template-columns:repeat(5,1fr);border:1px solid #b8d4d4;">
    Each day (border-right except last; today gets background:#deedee):
    <div style="padding:14px 12px;border-right:1px solid #b8d4d4;[background:#deedee if today];">
      DOW: <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#5a6285;margin-bottom:2px;">[MON|TUE...]</div>
      Date: <div style="font-family:'Source Serif 4',Georgia,serif;font-size:20px;font-weight:500;color:#1a2035;letter-spacing:-0.01em;line-height:1;">[day number]</div>
      Verdict: <div style="font-weight:600;font-size:11.5px;margin-top:10px;color:[#2a8a58|#b87820|#b02818];">[GOOD|CHOPPY|ROUGH]</div>
      Note: <div style="font-size:11.5px;color:#5a6285;margin-top:4px;line-height:1.4;">[1-line summary]</div>
    COLOR: <3ft+<15kt=green | 3-4ft or 15-20kt=orange | 4ft++15+kt or SCA=red. 2-3ft days with <15kt wind = GREEN.
  <p style="font-family:'JetBrains Mono',monospace;font-size:10px;color:#5a6285;letter-spacing:0.1em;text-transform:uppercase;margin:12px 0 0;">Offshore heights from buoys 20-60nm. Nearshore varies. Check with your operator.</p>

11. SAFETY TIP:
<div style="padding:24px 28px;background:#deedee;border-top:1px solid #b8d4d4;border-bottom:1px solid #b8d4d4;">
  <h3 style="font-family:'Source Serif 4',Georgia,serif;font-weight:500;font-size:22px;letter-spacing:-0.01em;margin:0 0 10px;color:#b02818;">⚠ [tip title tied to today's conditions]</h3>
  <p style="font-family:'Source Serif 4',Georgia,serif;font-size:15.5px;color:#1a2035;margin:0;line-height:1.55;">[2-3 sentences, data-grounded, specific to today]</p>

12. SUN & UV (5-column grid):
<section style="padding:28px;border-top:1px solid #b8d4d4;">
  [section header: "Sun & UV" / meta: "[weekday] · Palm Beach"]
  <div style="display:grid;grid-template-columns:repeat(5,1fr);border:1px solid #b8d4d4;">
    Each cell (border-right except last): <div style="padding:14px 12px;border-right:1px solid #b8d4d4;">
      Label: font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:0.12em;text-transform:uppercase;color:#5a6285;margin-bottom:6px
      Value: font-family:'Source Serif 4',Georgia,serif;font-size:18px;font-weight:500;color:#1a2035;letter-spacing:-0.005em
      Sub if needed: <small style="font-family:'Inter Tight',Arial,sans-serif;font-size:11px;font-weight:500;color:#5a6285;display:block;margin-top:2px;">
    Columns: Sunrise | AM Golden Hour | PM Golden Hour | Sunset | UV Index
    UV value style: font-size:28px;font-weight:500;color:[#b02818 if>=8|#b87820 if>=6|#2a8a58 if<6]
    UV sub: "[Low|Moderate|High|Very High] · [protection note]"

13. POLL:
<section style="padding:28px;border-top:1px solid #b8d4d4;">
  [section header: "Weekly poll" / meta: "Reply · we read every one"]
  <div style="border:1px solid #b8d4d4;padding:20px;">
    <div style="font-family:'Source Serif 4',Georgia,serif;font-size:20px;font-weight:400;letter-spacing:-0.01em;color:#1a2035;margin:6px 0 14px;">[question relevant to today's conditions]</div>
    <div style="display:flex;flex-direction:column;gap:6px;">
      Each option: <a href="mailto:fronczakantoni2@gmail.com?subject=Poll:[option]" style="display:flex;align-items:center;padding:11px 14px;border:1px solid #96bfbf;font-family:'Inter Tight',Arial,sans-serif;font-size:13.5px;color:#1a2035;text-decoration:none;">
        <span style="font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:500;color:#5a6285;margin-right:14px;border:1px solid #b8d4d4;padding:2px 6px;border-radius:2px;min-width:22px;text-align:center;">[A|B|C|D]</span>[option text]</a>
    </div>
    <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#5a6285;margin-top:12px;">Tap to reply. We read every response.</div>
  </div>

14. FOOTER:
<footer style="padding:28px;border-top:2px solid #1a2035;background:#eef6f6;">
  Forward ask: <p style="font-family:'Source Serif 4',Georgia,serif;font-style:italic;font-size:16px;color:#323855;text-align:center;padding:14px 0;border-top:1px solid #b8d4d4;border-bottom:1px solid #b8d4d4;margin:0 0 22px;">Know someone on the water? Forward this to a diver, angler, or anyone Space Coast to Keys. Free every morning.</p>
  Sources: <p style="font-size:11px;color:#5a6285;line-height:1.6;margin:0 0 18px;font-family:'Inter Tight',Arial,sans-serif;">Sources: NDBC buoys 41009 (Space Coast, 20nm), 41114 (Treasure Coast, 6.5nm), LKWF1 (BHB inshore), 41122 (Deerfield-Miami, 23nm), SMKF1 (Marathon, 1nm), 42095 (Key West, 15nm). Upper Keys: MLRF1 decommissioned Feb 2023, no replacement. NWS zones AMZ650/670. BHB windows from iDiveFlorida. UV from Open-Meteo. Offshore buoy readings differ from nearshore — confirm with your captain.</p>
  Disclaimer: <p style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:0.06em;color:#8890a8;line-height:1.7;margin:0;text-transform:uppercase;">The Florida Flow aggregates NOAA, NWS, and Open-Meteo data for informational purposes. Forecasts are predictions, not guarantees. Confirm all conditions with your operator before heading out. Use at your own risk.</p>
  Sig: <div style="display:flex;justify-content:space-between;margin-top:20px;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#5a6285;"><span>thefloridaflow.com</span><span>Issue #${issueNumber} · ${etShort}</span></div>
</footer>

Close wrapper div.

After the closing </div>, output a metadata block in this exact format (no extra whitespace, no markdown):
<!--META
TITLE: The Florida Flow — Issue #${issueNumber} · ${etShort}
SUBJECT: [email subject line, max 60 chars. Lead with the single most striking number or condition from today's data. Format: "[data point] — [what it means]". Examples: "3 ft at 9s off Space Coast — rip risk elevated" / "BHB window 8:46–9:46 AM · 79°F · low current" / "Calm seas coast-wide — best morning in two weeks". Never start with "The Florida Flow" or "Issue". Data first, always.]
DESC: [1 sentence, 140 chars max: today's single most notable condition + region + "Free South Florida ocean conditions newsletter."]
EXCERPT: [2 sentences max, 160 chars total: the single most actionable fact today + what to do with it. Plain English. No jargon. This is the inbox preview line — make it impossible to ignore.]
META-->`

    // Run both Claude calls in parallel
    const [socialMessage, ghostMessage] = await Promise.all([
      anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2800,
        messages: [{ role: 'user', content: socialPrompt }],
      }),
      anthropic.beta.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 16000,
        betas: ['output-128k-2025-02-19'],
        messages: [{ role: 'user', content: ghostPrompt }],
      }),
    ])

    const socialContent = socialMessage.content[0].type === 'text' ? socialMessage.content[0].text : ''
    const ghostRaw      = ghostMessage.content[0].type === 'text'  ? ghostMessage.content[0].text  : ''
    if (!ghostRaw) return NextResponse.json({ error: 'Claude returned empty ghost response' }, { status: 500 })

    // Split HTML from metadata block
    const metaMatch  = ghostRaw.match(/<!--META\n([\s\S]*?)\nMETA-->/)
    const ghostContent = ghostRaw.replace(/<!--META[\s\S]*?META-->/, '').trim()
    const metaTitle  = metaMatch?.[1].match(/^TITLE:\s*(.+)$/m)?.[1].trim() ?? `The Florida Flow — Issue #${issueNumber} · ${etShort}`
    const metaSubject = metaMatch?.[1].match(/^SUBJECT:\s*(.+)$/m)?.[1].trim() ?? `The Florida Flow — Issue #${issueNumber} · ${etShort}`
    const metaDesc   = metaMatch?.[1].match(/^DESC:\s*(.+)$/m)?.[1].trim()  ?? ''
    const excerpt    = metaMatch?.[1].match(/^EXCERPT:\s*(.+)$/m)?.[1].trim() ?? ''

    // Inject preheader (inbox preview text) as hidden HTML before the main content
    const preheader = excerpt
      ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#0f172a;">${excerpt}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>`
      : ''
    const emailHtml = preheader + ghostContent

    // Helper: commit a file to GitHub (retries once on 409 conflict)
    async function commitToGitHub(filePath: string, content: string, commitMessage: string): Promise<string | null> {
      const apiUrl = `https://api.github.com/repos/thefloridaflow/The-Florida-Flow/contents/${filePath}`
      const headers = { Authorization: `token ${githubToken}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }
      const encoded = Buffer.from(content).toString('base64')

      async function fetchSha(): Promise<string | undefined> {
        const res = await fetch(apiUrl, { headers })
        if (res.ok) return (await res.json()).sha
        return undefined
      }

      async function tryPut(sha: string | undefined): Promise<Response> {
        const body: Record<string, string> = { message: commitMessage, content: encoded }
        if (sha) body.sha = sha
        return fetch(apiUrl, { method: 'PUT', headers, body: JSON.stringify(body) })
      }

      let sha = await fetchSha()
      let put = await tryPut(sha)

      // On conflict, re-fetch SHA and retry once
      if (put.status === 409) {
        sha = await fetchSha()
        put = await tryPut(sha)
      }

      if (!put.ok && put.status !== 409) return `GitHub ${put.status} on ${filePath}: ${await put.text()}`
      return null
    }

    // Parse social posts
    const [xPost = '', fbScuba = '', fbGeneral = '', fbFishing = '', redditPost = ''] = socialContent.split(/^---$/m).map(s => s.trim())

    const socialMarkdown = `# Social Posts — ${etDate}

## X (Twitter)

${xPost}

### Twitter exposure checklist
- Post Thu/Fri mornings for weekend planning traffic
- Search "diving florida", "snorkeling conditions", "offshore fishing florida" and reply to recent tweets with today's data
- Tag local shops/charters when mentioning their area (e.g. @ForcE_Dive, @CaptainHooksMiami)
- Hashtags to add: #SouthFlorida #scuba #diveflorida #floridafishing #spearfishing

---

## Facebook — Scuba / Diving groups

${fbScuba}

---

## Facebook — General Florida groups

${fbGeneral}

---

## Facebook — Fishing groups

${fbFishing}

---

## Reddit

${redditPost}

### Reddit posting guide
- Paste into the suggested subreddit above
- Also works in: r/Florida, r/scubadiving, r/spearfishing, r/FishingFlorida
- If flagged for self-promo: reply "happy to remove if not useful, just tracking this data daily"
- Best time to post: 7-9am ET weekdays

---

_Generated by Florida Flow cron — Issue #${issueNumber}_
`

    const testEmail = req.nextUrl.searchParams.get('test')

    // Send via Resend — broadcast to full list, or single email if ?test=address
    async function sendViaResend(html: string, subject: string, broadcastName: string): Promise<string | null> {
      const resend = new Resend(resendKey)
      if (testEmail) {
        const { error } = await resend.emails.send({
          from: 'Antoni | The Florida Flow <antoni@thefloridaflow.com>',
          replyTo: 'fronczakantoni2@gmail.com',
          to: testEmail,
          subject: `[TEST] ${subject}`,
          html,
        })
        if (error) return `Resend error: ${error.message}`
        return null
      }
      const { data: broadcast, error: createError } = await resend.broadcasts.create({
        audienceId: 'ce90f469-8f63-419a-99c2-dd4208169f12',
        from: 'Antoni | The Florida Flow <antoni@thefloridaflow.com>',
        replyTo: 'fronczakantoni2@gmail.com',
        name: broadcastName,
        subject,
        html,
      } as Parameters<typeof resend.broadcasts.create>[0])
      if (createError) return `Resend create error: ${createError.message}`
      if (!broadcast?.id) return 'Resend: no broadcast ID returned'
      const { error: sendError } = await resend.broadcasts.send(broadcast.id)
      if (sendError) return `Resend send error: ${sendError.message}`
      return null
    }

    // Commit social posts + HTML archive, and send via Resend — all in parallel
    const [ghErr1, ghErr2, resendError] = await Promise.all([
      socialContent ? commitToGitHub(`drafts/${etDate}-social.md`, socialMarkdown, `social posts ${etDate}`) : Promise.resolve(null),
      commitToGitHub(`drafts/${etDate}-ghost.html`, ghostContent, `ghost body ${etDate} (issue #${issueNumber})`),
      sendViaResend(emailHtml, metaSubject, metaTitle),
    ])

    return NextResponse.json({ ok: true, sent: !resendError, test: testEmail ?? null, issue: issueNumber, date: etDate, githubErrors: [ghErr1, ghErr2].filter(Boolean), resendError: resendError ?? 'ok' })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
