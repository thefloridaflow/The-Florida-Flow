import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { fetchAllBuoys, fetchTides, fetchMarineForecast, fetchUVIndex, fetchCurrents } from '@/lib/noaa'
import { getSunTimes } from '@/lib/sun'

export const maxDuration = 60

// Issue #1 launched March 17 2026
const LAUNCH_DATE = new Date('2026-03-17T00:00:00-04:00')

const REGIONS = [
  { name: 'Space Coast (Cocoa Beach / Sebastian)', buoyId: '41009' },
  { name: 'Treasure Coast (Vero / Ft Pierce)',      buoyId: '41114' },
  { name: 'Blue Heron Bridge',                     buoyId: 'LKWF1' },
  { name: 'Palm Beach / Singer Is.',               buoyId: 'LKWF1' },
  { name: 'Deerfield / Pompano',                   buoyId: '41122' },
  { name: 'Fort Lauderdale',                       buoyId: '41122' },
  { name: 'Miami / Key Biscayne',                  buoyId: '41122' },
  { name: 'Key Largo / Upper Keys',                buoyId: '42095' },
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
    const appBase = process.env.NEXT_PUBLIC_APP_URL ?? 'https://the-florida-flow.vercel.app'
    const [buoys, tides, forecast, uv, current, operatorRes, bhbRes] = await Promise.all([
      fetchAllBuoys(),
      fetchTides(),
      fetchMarineForecast(),
      fetchUVIndex(),
      fetchCurrents(),
      fetch(`${appBase}/api/operator-logs`, { signal: AbortSignal.timeout(10000) }).then(r => r.json()).catch(() => []),
      fetch(`${appBase}/api/bhb-tides`,     { signal: AbortSignal.timeout(10000) }).then(r => r.json()).catch(() => []),
    ])

    const byId = Object.fromEntries(buoys.map((b: { stationId: string }) => [b.stationId, b]))

    // Build buoy summary for each region
    const buoySummary = REGIONS.map(({ name, buoyId }) => {
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

    // Tides
    const tidesSummary = tides.predictions.slice(0, 8).map((p: { time: string; type: string; height: string }) =>
      `${p.time} ${p.type === 'H' ? 'High' : 'Low'} ${p.height} ft`
    ).join('\n')

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

    const prompt = `You are writing Issue #${issueNumber} of The Florida Flow newsletter for ${etLong}.

LIVE DATA — use ONLY what is below. Do not invent conditions, sightings, or forecast details.

=== BUOY DATA (NOAA NDBC, observed) ===
${buoySummary}

=== OPERATOR REPORTS (scraped this morning) ===
${operatorSummary}

=== BHB DIVE WINDOWS (iDiveFlorida) ===
${bhbSummary}

=== TIDE PREDICTIONS (NOAA station 8722588, Lake Worth / BHB) ===
${tidesSummary}

=== UV INDEX (Open-Meteo) ===
${uvSummary}

=== CURRENTS ===
${currentSummary}

=== SUN TIMES (Palm Beach area, Eastern Time) ===
${sunSummary}

=== NWS MARINE FORECAST (AMZ630, issued this morning) ===
${forecast.forecast || 'Unavailable'}

=== INSTRUCTIONS ===
Generate a complete HTML newsletter following EXACTLY the structure and CSS below.

TONE AND ACCURACY RULES (non-negotiable):
- Report data only. Never tell readers whether to go out, seek shelter, or make any judgment call. That is the captain's call. End notes with "verify with your operator" or "check with your captain" — never with a directive.
- Never open with emergency language. The first sentence of the newsletter must describe conditions factually, not issue warnings.
- Translate NWS meteorological jargon into plain English for a general audience. "Shower" = brief rain shower (short burst of rain, not a storm). "ISOLD" or "isolated" = occasional, affecting less than 10% of the area. "SCTD" or "scattered" = patchy, affecting 30–50% of the area. "OCNL" = occasional. "Seas subsiding" = waves calming down. Always use the plain-English version, never the NWS shorthand.
- Every sea height cited from a buoy MUST include the buoy's distance offshore: e.g. "buoy 41114 (20 nm offshore) reading 8.9 ft — nearshore conditions will be smaller." Offshore buoy readings are NOT nearshore conditions.
- Never present far-offshore forecast peaks (e.g. "17 ft occasionally") as if they apply to nearshore or inshore waters. If you cite an offshore peak, note it is for waters 20-60 nm from shore.
- Advisory/warning bars: only if there is an ACTIVE NWS advisory (SCA, Gale Warning, etc.) explicitly named in the forecast text. Use exact NWS language. No dramatic rewrites.
- No opinion on whether conditions are "diveable," "fishable," or safe. Report the numbers. Captains decide.
- Activity verdicts: state observed/forecast conditions per activity — no "Poor/Dangerous" labels. Use "Elevated," "Building," "Calm," "Marginal" based purely on data. CRITICAL: offshore buoy readings (20–60 nm out) are NOT nearshore conditions. A buoy reading 4–5 ft at 20 nm offshore typically means 1–3 ft nearshore. Never restrict diving to "BHB only" or declare offshore diving "not recommended" based solely on offshore buoy data — that is a captain's call, not ours. Only flag an activity as restricted if there is an active named NWS advisory (SCA, Gale Warning, etc.).
- Marine Life Sighting Alert: ONLY include species/sightings explicitly in operator reports. If none, say "No confirmed sightings today."
- Week Outlook: derive day-by-day from NWS forecast text only. Do not extrapolate beyond what the forecast says.
- Tag observed buoy data with <span class="tag-obs">OBSERVED</span>, estimated/predicted with <span class="tag-pred">PREDICTED</span>.
- Poll question: rotate — rip currents, best local dive site, how readers check conditions, favorite activity, favorite Keys destination.
- Do not add any markdown, commentary, or text outside the HTML.

=== HTML TEMPLATE (fill in the [BRACKETS], keep all CSS and classes exactly) ===
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>The Florida Flow | Issue #${issueNumber} | ${etShort}</title>
<style>
  body { font-family: Georgia, serif; background: #f5f5f0; color: #1a1a1a; margin: 0; padding: 0; }
  .wrapper { max-width: 680px; margin: 0 auto; background: #ffffff; padding: 40px 36px 48px 36px; }
  .top-date { text-align: right; font-size: 13px; color: #888; margin-bottom: 6px; font-family: Arial, sans-serif; }
  .masthead-title { font-size: 32px; font-weight: bold; color: #1a1a1a; margin: 0 0 4px 0; }
  .masthead-sub { font-size: 13px; color: #666; margin: 0 0 4px 0; font-family: Arial, sans-serif; }
  .masthead-issue { font-size: 15px; color: #555; margin: 0 0 28px 0; font-family: Arial, sans-serif; }
  .issue-date { font-size: 15px; color: #333; margin-bottom: 20px; font-family: Arial, sans-serif; }
  .advisory-bar { background: #fef9e7; border-left: 4px solid #e67e22; padding: 12px 16px; margin-bottom: 16px; font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; color: #7d4a00; }
  .warning-bar { background: #fdedec; border-left: 4px solid #c0392b; padding: 12px 16px; margin-bottom: 28px; font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; color: #7b241c; }
  .section-title { font-size: 18px; font-weight: bold; color: #1a1a1a; margin: 32px 0 12px 0; border-bottom: 2px solid #e0e0e0; padding-bottom: 6px; }
  .headline-text { font-size: 15px; line-height: 1.7; color: #222; margin-bottom: 14px; }
  .vis-note { background: #f9f9f6; border: 1px solid #ddd; padding: 12px 16px; font-size: 13px; color: #444; font-family: Arial, sans-serif; line-height: 1.6; margin-bottom: 18px; }
  table { width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 13px; margin-bottom: 10px; }
  th { background: #1a1a1a; color: #ffffff; padding: 10px; text-align: left; font-weight: bold; }
  td { padding: 10px; border-bottom: 1px solid #e8e8e8; vertical-align: top; }
  tr:nth-child(even) td { background: #fafafa; }
  .region-name { font-weight: bold; color: #1a1a1a; }
  .rating-good { color: #27ae60; font-weight: bold; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
  .rating-marginal { color: #e67e22; font-weight: bold; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
  .rating-rough { color: #c0392b; font-weight: bold; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
  .tag-obs { display: inline-block; background: #d5f5e3; color: #1e8449; font-size: 10px; font-weight: bold; padding: 2px 5px; border-radius: 3px; margin-top: 3px; }
  .tag-pred { display: inline-block; background: #fef9e7; color: #b7770d; font-size: 10px; font-weight: bold; padding: 2px 5px; border-radius: 3px; margin-top: 3px; }
  .sources-line { font-size: 12px; color: #777; font-style: italic; font-family: Arial, sans-serif; line-height: 1.6; margin-top: 10px; margin-bottom: 28px; }
  .sighting-box { background: #eafaf1; border-left: 4px solid #27ae60; padding: 14px 16px; font-family: Arial, sans-serif; font-size: 14px; color: #1a4a2a; line-height: 1.65; margin-bottom: 28px; }
  .sighting-label { font-weight: bold; font-size: 13px; margin-bottom: 6px; }
  .safety-box { background: #fdedec; border-left: 4px solid #c0392b; padding: 14px 16px; font-family: Arial, sans-serif; font-size: 14px; color: #7b241c; line-height: 1.65; margin-bottom: 28px; }
  .safety-label { font-weight: bold; font-size: 13px; margin-bottom: 6px; }
  .week-box { background: #f9f9f6; border: 1px solid #ddd; padding: 16px 18px; font-family: Arial, sans-serif; font-size: 14px; color: #1a1a1a; line-height: 1.9; margin-bottom: 28px; }
  .referral-box { background: #eaf4fb; border-left: 4px solid #1a6fa0; padding: 16px 18px; font-family: Arial, sans-serif; font-size: 14px; color: #0d3a55; line-height: 1.65; margin-bottom: 28px; }
  .referral-box strong { display: block; font-size: 15px; margin-bottom: 8px; }
  .poll-box { background: #f0f4ff; border-left: 4px solid #3a6fa0; padding: 16px 18px; font-family: Arial, sans-serif; font-size: 14px; color: #1a2a4a; line-height: 1.65; margin-bottom: 28px; }
  .poll-box strong { display: block; font-size: 15px; margin-bottom: 12px; }
  .poll-option { background: #ffffff; border: 1px solid #c0d0e8; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px; font-size: 14px; color: #1a2a4a; }
  .disclaimer-box { background: #f5f5f5; border: 1px solid #ddd; padding: 12px 16px; font-size: 12px; color: #666; font-family: Arial, sans-serif; line-height: 1.6; margin-bottom: 28px; }
  .footer { text-align: center; font-size: 12px; color: #aaa; font-family: Arial, sans-serif; border-top: 1px solid #e0e0e0; padding-top: 20px; margin-top: 10px; }
  .product-box { background: #f0fdf4; border-left: 4px solid #27ae60; padding: 12px 16px; font-family: Arial, sans-serif; font-size: 13px; color: #1a4a2a; line-height: 1.6; margin-bottom: 18px; }
  .product-box a { color: #1a6fa0; font-weight: bold; text-decoration: none; }
</style>
</head>
<body>
<div class="wrapper">

  <div class="top-date">${etShort}</div>
  <div class="masthead-title">The Florida Flow</div>
  <div class="masthead-sub">Daily ocean conditions for anyone on the water, Space Coast to Key Largo</div>
  <div class="masthead-issue">Issue #${issueNumber}</div>
  <div class="issue-date">${etLong}</div>

  <div style="background:#eaf4fb; border:1px solid #b0d4ec; border-radius:6px; padding:10px 16px; margin-bottom:20px; font-family:Arial,sans-serif; font-size:13px; color:#0d3a55;">
    Check live conditions anytime at <a href="https://the-florida-flow.vercel.app" style="color:#1a6fa0; font-weight:bold; text-decoration:none;">the-florida-flow.vercel.app</a> — buoys, tides, dive windows, UV, and more. Updated hourly.
  </div>

  [ADVISORY BAR if SCA or notable warning — omit entirely if conditions are calm]
  [WARNING BAR if severe or already rough offshore — omit entirely if not warranted]

  <div class="section-title">Conditions Headline</div>
  <p class="headline-text">[Paragraph 1: lead with the most important condition right now — what are the numbers saying, what changed overnight, where is it rough vs calm. Use specific buoy readings from the data above.]</p>
  <p class="headline-text">[Paragraph 2: NWS forecast summary — what is the forecast saying, what to expect today and tonight. Quote the zone and issuance time if available.]</p>
  <p class="headline-text">[Paragraph 3: Operator reports — what did operators confirm yesterday. Only include what is in the operator reports above. If no operator data, skip this paragraph.]</p>
  <p class="headline-text">[Paragraph 4: BHB tide windows today — what times, what quality, any wind concerns.]</p>

  <div class="section-title">Daily Data</div>

  <div class="vis-note">
    <strong>Data sourcing:</strong> [1-2 sentences explaining what data is observed vs predicted today, and the most important caveat for this morning specifically.]
  </div>

  <table>
    <thead>
      <tr><th>Region</th><th>Conditions Rating</th><th>Vis</th><th>Temp</th><th>Seas</th><th>Wind / Note</th></tr>
    </thead>
    <tbody>
      [8 rows — one for each region. Do NOT color or highlight table rows beyond the default CSS. Use only the small tag-obs/tag-pred badges on each individual data point — no other cell or row highlighting. Format each data cell as: the value on one line, then the tag on the next line. Example: "8.2 ft<br><span class="tag-obs">OBSERVED</span>". Vis: If an operator report explicitly states visibility for that region today, use it with tag-obs. Otherwise estimate using this model with tag-pred — seas under 1ft + winds under 10kt: Est. 40–80 ft; seas 1–2ft + winds under 15kt: Est. 20–50 ft; seas 2–3ft or winds 15–20kt: Est. 10–30 ft; seas 3–5ft or winds over 20kt: Est. 5–15 ft; seas over 5ft: Est. under 10 ft. Onshore winds (E/SE/NE) reduce estimate one tier vs offshore winds (W/NW/SW). BHB is protected from swell — write "Tidal — 5–20 ft" with tag-pred unless Force-E or an operator reports actual viz. Temp from buoy (tag-obs) or write "No data" (tag-pred). Seas from buoy (tag-obs) or NOAA nearshore estimate (tag-pred). Wind/Note: buoy reading with distance offshore, forecast note, or operator confirmation. BHB row: "Protected" for seas, include tide window time.]
    </tbody>
  </table>

  <p class="sources-line">[List all data sources with station IDs, observation times UTC, and any operator confirmations. Format like: "Sources: NOAA AMZ630 issued [time]. Buoy 41114 observed [time] UTC. LKWF1 observed [time] UTC. [Operator] confirmed [date]."]</p>

  <div class="product-box">
    First time at BHB? <strong>The Florida Flow BHB Site Guide</strong> covers tide strategy, marine life by season, best entry points, and what to expect underwater. Free with 3 referrals or $12. <a href="https://ko-fi.com/s/59604a0ac1">Get the guide →</a>
  </div>

  <div class="section-title">Today on the Water — By Activity</div>

  <table>
    <thead>
      <tr><th>Activity</th><th>Verdict</th><th>Notes</th></tr>
    </thead>
    <tbody>
      [5 rows: 🤿 Scuba Diving, 🏄 Surfing, 🚣 Kayak / SUP, ⛵ Boating / Fishing, 🏖️ Beach / Swimming. Each with a specific verdict and detailed notes using actual data. For diving mention BHB window and any operator-confirmed conditions. For surfing mention rip current risk. For boating mention SCA if active.]
    </tbody>
  </table>

  <div style="background:#f0f7ff; border-left: 4px solid #1a6fa0; padding: 14px 16px; font-family: Arial, sans-serif; font-size: 14px; color: #0d3a55; line-height: 1.65; margin-bottom: 28px;">
    <strong>Why surfers read The Florida Flow:</strong> Surfline tells you the wave height. We tell you the rip current risk, when the swell expires, and what else is happening on the water. Diving, fishing, boating, beach conditions all in one 2-minute read. Free every morning.
  </div>

  <div class="referral-box">
    <strong>Know someone on the water from the Space Coast to the Keys?</strong>
    Share The Florida Flow with 3 friends and get the Florida Flow Site Guide — Issue 01: Blue Heron Bridge. Tide windows, marine life, local tips. Everything you need before you splash.<br><br>
    <em>Your personal referral link: https://florida-flow-c2ae83.beehiiv.com/subscribe?ref=ySxwobpxV8</em>
  </div>

  <div class="week-box">
    <strong>Week Outlook</strong><br><br>
    [Day-by-day outlook derived from NWS forecast text. Format each day as: <span style="color:[#27ae60 good / #e67e22 marginal / #c0392b rough]; font-weight:bold;">[Day] [emoji 🟢/🟡/🔴]:</span> [conditions summary].<br> End with: "All offshore sea heights from NOAA buoys 20-60 nm from shore. Nearshore conditions smaller. Always check with your operator."]
  </div>

  <div class="section-title">Marine Life Sighting Alert</div>
  <div class="sighting-box">
    <div class="sighting-label">[🟢 CONFIRMED — or ⚪ NO REPORTS TODAY depending on operator data]</div>
    [Only include species and sightings that appear in the operator reports above. If Narcosis or Rainbow Reef mentioned specific animals, sites, viz, or conditions — include them here with operator name and date. If no operator sightings available, say: "No confirmed sightings today. Check back tomorrow — operator logs update daily."]
  </div>

  <div class="section-title">Sun & UV</div>
  <table>
    <thead>
      <tr><th>Sunrise</th><th>Morning Golden Hour</th><th>Evening Golden Hour</th><th>Sunset</th><th>UV Index</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>[sunrise time from SUN TIMES data]</td>
        <td>[morning golden hour range]</td>
        <td>[evening golden hour range]</td>
        <td>[sunset time]</td>
        <td>[UV index value and label — e.g. "9 · Very High" with a note to wear reef-safe SPF 50+ if UV ≥ 6]</td>
      </tr>
    </tbody>
  </table>

  <div class="section-title">Daily Safety Tip</div>
  <div class="safety-box">
    <div class="safety-label">[Relevant title based on today's conditions]</div>
    [2-3 sentences of practical safety advice directly tied to today's actual conditions — rip currents if surf is up, waterspouts if storms nearby, UV if index is high, current awareness at BHB if wind is building, etc.]
  </div>

  <div class="section-title">Quick Poll</div>
  <div class="poll-box">
    <strong>[A question relevant to South Florida water sports — rotate topics]</strong>
    <div class="poll-option">[Option 1]</div>
    <div class="poll-option">[Option 2]</div>
    <div class="poll-option">[Option 3]</div>
    <div class="poll-option">[Option 4]</div>
    <br>
    <em style="font-size:12px; color:#666;">Reply to this email with your answer, we read every response.</em>
  </div>

  <div class="disclaimer-box">
    <strong>Disclaimer:</strong> The Florida Flow aggregates publicly available NOAA forecasts, buoy data, and operator logs. All offshore sea heights are from NOAA buoys 20-60 nm from shore. Nearshore conditions will be smaller and vary by location, bottom topography, and local factors. Conditions ratings are informational only — always confirm with your captain or dive operator before heading out. Use at your own risk.
  </div>

  <div class="footer">
    The Florida Flow &nbsp;|&nbsp; Daily ocean conditions for anyone on the water<br>
    Space Coast to Key Largo &nbsp;|&nbsp; Free. Every morning. In 2 minutes.<br><br>
    &copy; 2026 The Florida Flow
  </div>

</div>
</body>
</html>`

    const anthropic = new Anthropic({ apiKey: anthropicKey })

    const socialPrompt = `You are writing social media posts to promote The Florida Flow — a free South Florida ocean conditions app and daily newsletter. The posts tease what's in today's data to drive people to the app. Voice: knowledgeable local, short sentences, real talk.

TODAY IS ${etLong}.

=== LIVE BUOY DATA (from this morning) ===
${buoySummary}

=== NWS MARINE FORECAST ===
${forecast.forecast?.slice(0, 800) || 'Unavailable'}

=== OPERATOR REPORTS (may be stale — check dates carefully) ===
${operatorSummary}

=== WHAT IS LIVE VS STALE ===
- Buoy data (seas, water temp, wind) = live from this morning. Use these numbers freely.
- NWS forecast = current. Use it.
- Operator reports = only use if dated TODAY (${etShort}). If dated any earlier, DO NOT reference them as current conditions. You may say "last report from [date] showed X" but never imply it reflects today.
- You have NO live visibility data. Do not state or imply what viz is today.

=== INSTRUCTIONS ===
Write 3 posts separated by exactly "---" on its own line.

POST 1 — X (Twitter) thread. 3 tweets separated by [TWEET].
- Purpose: hook people into checking the app with the most interesting number from today's live buoy data.
- Tweet 1 (≤260 chars): One punchy sentence about the most notable buoy reading today. A local texting a friend. End with 🧵
- Tweet 2 (≤270 chars): Regional breakdown — Space Coast / Treasure Coast / Gold Coast / Keys. Seas ft + water temp °F. Buoy distance in parens. Numbers only, no fluff.
- Tweet 3 (≤240 chars): The one forecast note that actually matters today (rain, wind shift, rough offshore, etc). End with: the-florida-flow.vercel.app
- No hashtags. No em dashes. No descriptive words ("glassy", "firing", "pumping") unless buoy data directly supports them. "Glassy" = winds under 5 kt.

POST 2 — Facebook (Scuba/Diving groups). 100-150 words.
- Purpose: give divers a reason to check the app and subscribe to the newsletter.
- Lead with the most dive-relevant live buoy reading (water temp, sea state, wind).
- Mention BHB wind/temp from LKWF1 buoy if data is available.
- Only include operator report if dated TODAY. If stale, skip it entirely or say "last report from [date]" — never imply it's current.
- No viz claims unless an operator reported today.
- End with: "Full conditions + tides + dive windows at the-florida-flow.vercel.app — free newsletter every morning."
- No hashtags. No em dashes. No descriptive condition words unless buoy numbers support them.

POST 3 — Facebook (General Florida groups). 80-120 words.
- Purpose: get everyday beach people to check the app.
- Audience: families, tourists, casual swimmers deciding if it's a good beach day. Not divers, not surfers.
- Talk about water temp, whether conditions are rough or calm (based on actual buoy seas/wind), and any weather to watch for.
- No wave periods, no buoy IDs, no technical jargon.
- End with: "Daily ocean conditions at the-florida-flow.vercel.app — free."
- No hashtags. No em dashes. Two short paragraphs max.`

    // Run newsletter generation and social post generation in parallel
    const [message, socialMessage] = await Promise.all([
      anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8096,
        messages: [{ role: 'user', content: prompt }],
      }),
      anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: socialPrompt }],
      }),
    ])

    const draftContent = message.content[0].type === 'text' ? message.content[0].text : ''
    if (!draftContent) return NextResponse.json({ error: 'Claude returned empty response' }, { status: 500 })

    const socialContent = socialMessage.content[0].type === 'text' ? socialMessage.content[0].text : ''

    // Helper: commit a file to GitHub (retries once on 409 conflict)
    async function commitToGitHub(filePath: string, content: string, commitMessage: string) {
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

      if (!put.ok) throw new Error(await put.text())
    }

    // Parse social posts
    const [xPost = '', fbScuba = '', fbGeneral = ''] = socialContent.split(/^---$/m).map(s => s.trim())

    const socialMarkdown = `# Social Posts — ${etDate}

## X (Twitter)

${xPost}

---

## Facebook — Scuba / Diving groups

${fbScuba}

---

## Facebook — General Florida groups

${fbGeneral}

---

_Generated by Florida Flow cron — Issue #${issueNumber}_
`

    // Commit newsletter and social posts in parallel
    await Promise.all([
      commitToGitHub(`drafts/${etDate}.html`, draftContent, `newsletter draft ${etDate} (issue #${issueNumber})`),
      socialContent ? commitToGitHub(`drafts/${etDate}-social.md`, socialMarkdown, `social posts ${etDate}`) : Promise.resolve(),
    ])

    return NextResponse.json({ ok: true, draft: `drafts/${etDate}.html`, social: `drafts/${etDate}-social.md`, date: etDate, issue: issueNumber })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
