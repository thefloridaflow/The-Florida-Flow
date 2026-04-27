import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { Resend } from 'resend'
import { createHmac } from 'crypto'
import { fetchAllBuoys, fetchMarineForecast, fetchUVIndex, fetchCurrents, fetchWeatherOutlook } from '@/lib/noaa'
import { getSunTimes } from '@/lib/sun'
import { buildNewsletterHtml, type NewsletterJson, type TemplateCtx } from '@/lib/newsletter-template'

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

    const ghostPrompt = `Generate Issue #${issueNumber} of The Florida Flow newsletter, ${etLong}. Output ONLY valid JSON — no markdown fences, no explanation.

${specialContext}

DATA:
BUOYS: ${buoySummary}
OPERATORS: ${operatorSummary}
BHB WINDOWS: ${bhbSummary}
UV: ${uvSummary} | CURRENTS: ${currentSummary} | SUN: ${sunSummary}
FORECAST: ${forecast.forecast?.slice(0, 1400) || 'Unavailable'}

RULES: Data only. No judgment calls. Plain English. NEVER use em dashes. Use comma or period instead. BREVITY: lede.paragraphs and beach.paragraphs max 2 sentences each (50 words max per paragraph). safety.body max 2 sentences. weekOutlook.note max 8 words. sightings.quote max 20 words. Keep total JSON output under 2500 words.

RATING SCALE: CALM <1ft/<10kt | GOOD 1-3ft/<15kt | CHOPPY 3-4ft/short period | ELEVATED 3-5ft/15-20kt | ROUGH 5ft+/>25kt | ACTIVE SCA named advisory
South FL: 2-3 ft seas are NORMAL. NW/W winds improve vis; E/NE worsen it.

VIS MODEL (PREDICTED unless operator confirms): <1ft+<10kt=40-80ft | 1-2ft+<15kt=20-50ft | 2-3ft+NW/W=20-50ft | 2-3ft+E/NE=10-30ft | 3-5ft/>20kt=5-15ft | >5ft=<10ft | BHB=Tidal 5-20ft
PERIOD CORRECTION: >=9s: reduce vis one tier. <=5s + <2ft: "surface chop, bottom less affected."

RIP RISK: low: height <2.3ft OR period <6s OR offshore wind | elevated: >=2.3ft AND 6-10s AND NE/E/ENE | high: >4ft AND 6-10s AND onshore, OR >5ft
FLAG: green <2ft+<10kt | yellow 2-3ft or 10-20kt onshore | red 3ft++onshore or >20kt

ACTIVITY RULES:
SCUBA: good=<3ft+<15kt | caution=3-4ft or 15-20kt | no=4ft+ AND onshore 15+kt. BHB: wind >12-15kt = no.
SURF: blown out if onshore >=20kt. Offshore <15kt + period >=8s = upgrade. Never good when onshore >=15kt.
FISHING: SCA = advise against offshore. Inshore fine.
KAYAK/SUP: good only <2ft+<10kt. Above that = caution minimum.
GULF STREAM: no + danger if seas 4ft+.

Output this JSON schema exactly (no other fields):
{
  "alert": { "type": "danger|warn|calm", "badgeLabel": "SCA (omit for calm)", "title": "...", "titleItalic": "italic emphasis (omit if none)", "subtitle": "..." },
  "verdict": { "todaysCall": "one sharp sentence", "status": "good|warn|danger", "statusLabel": "GOOD|CHOPPY|ROUGH|ACTIVE SCA", "bestWindow": "time or activity", "bestWindowSub": "context", "seasNow": "X ft", "seasSub": "buoyId context", "water": "XX°F", "waterSub": "buoyId" },
  "lede": { "headline": "editorial headline", "headlineItalic": "italic part (omit if none)", "paragraphs": ["para 1", "para 2"] },
  "regions": [
    { "state": "good|choppy|rough|nodata", "stateLabel": "Good|Choppy|Rough|No data", "vis": "XX-XX ft", "visObs": false }
  ],
  "activities": [
    { "name": "Scuba", "verdict": "good|caution|no", "verdictLabel": "Good|Caution|Do not go", "notes": "..." },
    { "name": "Surfing", "verdict": "...", "verdictLabel": "...", "notes": "..." },
    { "name": "Kayak / SUP", "verdict": "...", "verdictLabel": "...", "notes": "..." },
    { "name": "Boating / Fishing", "verdict": "...", "verdictLabel": "...", "notes": "..." },
    { "name": "Beach", "verdict": "...", "verdictLabel": "...", "notes": "..." },
    { "name": "Gulf Stream", "verdict": "...", "verdictLabel": "...", "notes": "..." }
  ],
  "beach": { "paragraphs": ["...", "..."], "ripRisk": "low|elevated|high", "flagColor": "green|yellow|red", "bestTimeNote": "optional morning/afternoon note" },
  "bhbNote": "1-2 sentences on BHB vis and wind",
  "sightings": [{ "operator": "...", "location": "...", "quote": "...", "vis": "optional", "water": "optional" }],
  "weekOutlook": [
    { "verdict": "good|choppy|rough", "verdictLabel": "GOOD|CHOPPY|ROUGH", "note": "1-line summary" }
  ],
  "safety": { "title": "tip title tied to today", "body": "2-3 sentences, data-grounded" },
  "poll": { "question": "...", "options": ["A text", "B text", "C text", "D text"] },
  "meta": { "subject": "max 60 chars, data first", "title": "The Florida Flow — Issue #${issueNumber} · ${etShort}", "desc": "140 chars max", "excerpt": "160 chars max, 2 sentences" }
}

regions: exactly 8 in order: Space Coast (41009) | Treasure Coast (41114) | Blue Heron Bridge (LKWF1) | Palm Beach (LKWF1) | Gold Coast (41122) | Upper Keys (nodata — MLRF1 decommissioned) | Marathon (SMKF1) | Key West (42095)
weekOutlook: exactly 5 entries starting with today`

    // Run both Claude calls in parallel
    const [socialMessage, ghostMessage] = await Promise.all([
      anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2800,
        messages: [{ role: 'user', content: socialPrompt }],
      }),
      anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        messages: [{ role: 'user', content: ghostPrompt }],
      }),
    ])

    const socialContent = socialMessage.content[0].type === 'text' ? socialMessage.content[0].text : ''
    const ghostRaw      = ghostMessage.content[0].type === 'text'  ? ghostMessage.content[0].text  : ''
    if (!ghostRaw) return NextResponse.json({ error: 'Claude returned empty ghost response' }, { status: 500 })

    // Parse JSON and build HTML from server-side template
    let newsletterJson: NewsletterJson
    try {
      const cleaned = ghostRaw.trim().replace(/^```\w*\n?/, '').replace(/\n?```$/, '')
      newsletterJson = JSON.parse(cleaned) as NewsletterJson
    } catch (e) {
      return NextResponse.json({ error: `Failed to parse newsletter JSON: ${e}`, raw: ghostRaw.slice(0, 500) }, { status: 500 })
    }

    const templateCtx: TemplateCtx = {
      issueNumber, etLong, etShort, now,
      byId: byId as TemplateCtx['byId'],
      bhbDays,
      uv,
      current: { speed: current.speed, direction: current.direction, error: !!current.error },
      sunrise, sunset, goldenMorningEnd, goldenEveningStart,
    }
    const ghostContent = buildNewsletterHtml(newsletterJson, templateCtx)

    const metaTitle   = newsletterJson.meta.title
    const metaSubject = newsletterJson.meta.subject
    const excerpt     = newsletterJson.meta.excerpt

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
