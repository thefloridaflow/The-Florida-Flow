import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
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
    if (!anthropicKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 503 })
    if (!githubToken)  return NextResponse.json({ error: 'GITHUB_TOKEN not set' }, { status: 503 })

    // Date + issue number
    const now = new Date()
    const etDate = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const etLong = now.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    const etShort = now.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric' })
    const msPerDay = 86400000
    const issueNumber = Math.max(1, Math.floor((now.getTime() - LAUNCH_DATE.getTime()) / msPerDay) + 1)

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

=== NWS MARINE FORECAST ===
${forecast.forecast?.slice(0, 1800) || 'Unavailable'}

=== DATA RULES ===
- Buoy data (seas, water temp, wind) = live. Use freely.
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
- Audience: divers in groups like "South Florida Scuba Divers," "Florida Underwater," "Spearfishing Florida."
- Purpose: give them one piece of data they can act on today, then drive them to the app.
- Hook: use formula A, B, C, or E (scuba version). The opening line must make a diver feel like they got useful intel just by reading it.
- Body: water temp by region, sea state, BHB conditions if relevant. Buoy data only. No viz claims. No operator reports.
- Naturally reference that the app shows tides, dive windows, and Port Everglades current, without being pushy.
- End with: "Full conditions + tides + dive windows at thefloridaflow.com — free newsletter every morning."
- No hashtags. No em dashes. Tone: experienced local diver sharing what they know.

POST 3 — Facebook (General Florida / beach groups). 80-120 words.
- Audience: families, tourists, casual swimmers and beachgoers, not enthusiasts.
- Purpose: help them decide if today is a good beach day and get them to bookmark the app.
- Hook: use formula A, B, or E (beach version). Speak to whether it's worth going, not just what the numbers are.
- Body: water temp (relatable, like "bathtub warm" only if >82°F, otherwise give the number), sea state in plain English (calm/rough/choppy), weather to watch for.
- No wave periods. No buoy IDs. No jargon of any kind.
- End with: "Daily ocean conditions at thefloridaflow.com — free."
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

    const ghostPrompt = `Generate the Ghost email body for Issue #${issueNumber}, ${etLong}. Ghost wraps this — output inner content only. ALL styles inline. No CSS classes, no style blocks.

${specialContext}

DATA (use only this):
BUOYS: ${buoySummary}
OPERATORS: ${operatorSummary}
BHB WINDOWS: ${bhbSummary}
UV: ${uvSummary} | CURRENTS: ${currentSummary} | SUN: ${sunSummary}
FORECAST: ${forecast.forecast?.slice(0, 1400) || 'Unavailable'}

RULES: Data only. No judgment calls. Offshore buoys (20-60nm) ≠ nearshore. Cite buoy distance. Plain English (no NWS jargon). NEVER use em dashes (—) anywhere. Use a comma, period, or colon instead.

RATING SCALE: CALM <1ft/<10kt | GOOD 1-2ft/<15kt | MARGINAL 2-3ft | CHOPPY 3-5ft/short period | ELEVATED 3-5ft/building | BUILDING worsening | ROUGH 5ft+/>25kt | ACTIVE SCA named advisory
Colors: green=#4ade80 (Calm/Good), orange=#fb923c (Marginal/Choppy/Elevated/Building), red=#f87171 (Rough/Active SCA)

VIS MODEL (PREDICTED unless operator confirms): <1ft+<10kt=40-80ft | 1-2ft+<15kt=20-50ft | 2-3ft/15-20kt=10-30ft | 3-5ft/>20kt=5-15ft | >5ft=<10ft. Onshore winds reduce one tier. BHB="Tidal 5-20ft".
PERIOD CORRECTION: Long-period swell reaches the ocean floor and stirs bottom sediment far more than short-period chop. If wave period >=9s: reduce vis prediction by one tier (e.g. 20-50ft becomes 10-30ft) even if height is moderate. If period <=5s and height <2ft: note "surface chop, bottom less affected." Short steep chop stays near-surface; long rollers penetrate to the bottom. This matters most for spearfishing and scuba vis predictions.
BADGES: OBSERVED=<span style="background:#064e3b;color:#6ee7b7;font-size:10px;font-weight:bold;padding:2px 5px;border-radius:3px;display:inline-block;margin-left:4px;">OBSERVED</span> PREDICTED=<span style="background:#78350f;color:#fcd34d;font-size:10px;font-weight:bold;padding:2px 5px;border-radius:3px;display:inline-block;margin-left:4px;">PREDICTED</span>

STYLES (apply inline to every element):
- Wrapper: <div style="background:#0f172a;padding:24px 28px;border-radius:8px;max-width:680px;font-family:Arial,sans-serif;color:#e2e8f0;">
- H2: font-size:17px;font-weight:bold;color:#ffffff;border-bottom:1px solid #334155;padding-bottom:6px;margin:28px 0 12px 0;font-family:Arial,sans-serif
- P body: font-size:15px;line-height:1.7;color:#e2e8f0;margin-bottom:14px;font-family:Georgia,serif
- TABLE: width:100%;border-collapse:collapse;font-size:13px;font-family:Arial,sans-serif;margin-bottom:16px
- TH: background:#1e293b;color:#94a3b8;padding:9px;text-align:left;white-space:nowrap;font-size:11px;text-transform:uppercase;letter-spacing:0.5px
- TD: padding:9px;border-bottom:1px solid #1e293b;vertical-align:top;color:#e2e8f0;background:#0f172a;font-family:Arial,sans-serif

OUTPUT all 12 sections inside the wrapper div:
1. Advisory bar (ONLY if active NWS advisory): background:#451a03;border-left:4px solid #f97316;color:#fed7aa — else omit
2. 3 condition paragraphs (buoy readings, forecast summary, BHB windows today)
3. App link: <p style="font-size:13px;color:#94a3b8;font-family:Arial,sans-serif;margin-bottom:24px;"><a href="https://thefloridaflow.com" style="color:#38bdf8;font-weight:bold;">Check live conditions at thefloridaflow.com</a> — buoys, tides, dive windows, UV. Updated hourly.</p>
4. Regional table: cols Region/Conditions/Vis/Seas/Wind/Water Temp/Buoy — 8 rows. Color-code Conditions with rating scale colors. OBSERVED/PREDICTED badges on data cells.
   After table: sourcing note (font-size:12px;color:#64748b) naming each buoy by coastline+distance, NWS zone, BHB from iDiveFlorida, UV from Open-Meteo. End: "Offshore buoy readings ≠ nearshore. Confirm with your captain."
   Then BHB ad: background:#052e16;border-left:4px solid #22c55e;color:#bbf7d0 — "First time at BHB? The Florida Flow BHB Site Guide — <a href="https://ko-fi.com/s/59604a0ac1" style="color:#4ade80;font-weight:bold;">Get the guide $12 →</a>"
5. Activity table: cols Activity/Verdict/Notes — 5 rows (🤿Scuba 🏄Surfing 🚣Kayak/SUP ⛵Boating/Fishing 🏖️Beach). Verdict from rating scale, color-coded inline. Notes end with "verify with your operator."
6. BHB Dive Windows: background:#0c1a2e;border-left:4px solid #0ea5e9;color:#bae6fd — tide times, window times, quality
7. Marine Life Sightings: background:#052e16;border-left:4px solid #22c55e;color:#bbf7d0 — operator-confirmed only. If Rainbow Reef has no data, say so by name.
8. Week Outlook: background:#1e293b;border:1px solid #334155;color:#e2e8f0 — day by day from NWS. Each day: <span style="color:[green/orange/red];font-weight:bold;">Day 🟢/🟡/🔴:</span> summary. End: "Offshore heights from buoys 20-60nm. Nearshore smaller. Check with your operator."
9. Safety Tip: background:#1c0a09;border-left:4px solid #ef4444;color:#fca5a5 — title + 2-3 sentences tied to today's data
10. Sun & UV: background:#1e293b;border:1px solid #334155;color:#e2e8f0 — single row showing Sunrise, Morning Golden Hour, Evening Golden Hour, Sunset, UV Index (colored: ≥8 red, ≥6 orange, <6 green). Use sun times and UV data.
11. Poll: background:#0f1f3d;border-left:4px solid #3b82f6;color:#bfdbfe — question + 4 mailto options (mailto:fronczakantoni2@gmail.com?subject=Poll:[option]) + "Tap to reply. We read every response."
11. Forward ask: background:#1e293b;border-left:4px solid #0ea5e9;color:#bae6fd — "Know someone on the water? Forward this to a diver, angler, or anyone Space Coast to Keys. Free every morning."
12. Disclaimer: font-size:11px;color:#475569;border-top:1px solid #1e293b;padding-top:16px — "The Florida Flow aggregates NOAA data. Offshore heights from buoys 20-60nm. Nearshore varies. Confirm with your captain. Use at your own risk."

Close wrapper div.

After the closing </div>, output a metadata block in this exact format (no extra whitespace, no markdown):
<!--META
TITLE: The Florida Flow — Issue #${issueNumber} · ${etShort}
DESC: [1 sentence, 140 chars max: today's single most notable condition + region + "Free South Florida ocean conditions newsletter."]
EXCERPT: [2 sentences max, 200 chars: lead with the most actionable data point for today, plain English, no jargon. This appears as the email preview line.]
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
    const metaDesc   = metaMatch?.[1].match(/^DESC:\s*(.+)$/m)?.[1].trim()  ?? ''
    const excerpt    = metaMatch?.[1].match(/^EXCERPT:\s*(.+)$/m)?.[1].trim() ?? ''

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

    // Ghost Admin API: generate JWT and publish draft
    async function publishToGhost(html: string, title: string): Promise<string | null> {
      const ghostKey = process.env.GHOST_ADMIN_API_KEY
      if (!ghostKey) return 'GHOST_ADMIN_API_KEY not set'
      const [id, secret] = ghostKey.split(':')
      const header  = Buffer.from(JSON.stringify({ alg: 'HS256', kid: id, typ: 'JWT' })).toString('base64url')
      const payload = Buffer.from(JSON.stringify({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300, aud: '/admin/' })).toString('base64url')
      const sig     = createHmac('sha256', Buffer.from(secret, 'hex')).update(`${header}.${payload}`).digest('base64url')
      const token   = `${header}.${payload}.${sig}`
      const res = await fetch('https://newsletter.thefloridaflow.com/ghost/api/admin/posts/', {
        method: 'POST',
        headers: { Authorization: `Ghost ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ posts: [{ title, html, status: 'draft', email_segment: 'all', custom_excerpt: excerpt, meta_title: metaTitle, meta_description: metaDesc }] }),
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) return `Ghost API ${res.status}: ${await res.text()}`
      return null
    }

    // Commit social posts and Ghost body in parallel; push draft to Ghost
    const [ghErr1, ghErr2, ghostError] = await Promise.all([
      socialContent ? commitToGitHub(`drafts/${etDate}-social.md`, socialMarkdown, `social posts ${etDate}`) : Promise.resolve(null),
      commitToGitHub(`drafts/${etDate}-ghost.html`, ghostContent, `ghost body ${etDate} (issue #${issueNumber})`),
      publishToGhost(ghostContent, `The Florida Flow — Issue #${issueNumber} · ${etShort}`),
    ])

    return NextResponse.json({ ok: true, ghostDraft: `drafts/${etDate}-ghost.html`, social: `drafts/${etDate}-social.md`, date: etDate, issue: issueNumber, githubErrors: [ghErr1, ghErr2].filter(Boolean), ghostError: ghostError ?? 'ok' })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
