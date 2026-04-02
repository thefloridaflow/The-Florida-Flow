import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createHmac } from 'crypto'
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
    const appBase = process.env.NEXT_PUBLIC_APP_URL ?? 'https://thefloridaflow.com'
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
  th { background: #1a1a1a; color: #ffffff; padding: 10px; text-align: left; font-weight: bold; white-space: nowrap; }
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
  .poll-option { display: block; background: #ffffff; border: 1px solid #c0d0e8; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px; font-size: 14px; color: #1a2a4a; text-decoration: none; }
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
    Check live conditions anytime at <a href="https://thefloridaflow.com" style="color:#1a6fa0; font-weight:bold; text-decoration:none;">thefloridaflow.com</a> — buoys, tides, dive windows, UV, and more. Updated hourly.
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
      [5 rows: 🤿 Scuba Diving, 🏄 Surfing, 🚣 Kayak / SUP, ⛵ Boating / Fishing, 🏖️ Beach / Swimming. Verdict MUST be 1-2 words max using ONLY: Good / Marginal / Elevated / Building / Calm / Rough / Active SCA. Never combine with qualifiers like "— inshore ok" or "— seek shelter" — put that in Notes instead. Notes: specific, data-backed, end with "verify with your operator" or "check with your captain".]
    </tbody>
  </table>

  <div style="background:#f0f7ff; border-left: 4px solid #1a6fa0; padding: 14px 16px; font-family: Arial, sans-serif; font-size: 14px; color: #0d3a55; line-height: 1.65; margin-bottom: 28px;">
    <strong>Why surfers read The Florida Flow:</strong> Surfline tells you the wave height. We tell you the rip current risk, when the swell expires, and what else is happening on the water. Diving, fishing, boating, beach conditions all in one 2-minute read. Free every morning.
  </div>

  <div class="referral-box">
    <strong>Know someone on the water from the Space Coast to the Keys?</strong>
    Forward this email to a diver, angler, or anyone who spends time on the water. Free every morning. No spam. Just conditions.
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
    <a class="poll-option" href="mailto:hello@thefloridaflow.com?subject=Poll: [Option 1]">👉 [Option 1]</a>
    <a class="poll-option" href="mailto:hello@thefloridaflow.com?subject=Poll: [Option 2]">👉 [Option 2]</a>
    <a class="poll-option" href="mailto:hello@thefloridaflow.com?subject=Poll: [Option 3]">👉 [Option 3]</a>
    <a class="poll-option" href="mailto:hello@thefloridaflow.com?subject=Poll: [Option 4]">👉 [Option 4]</a>
    <br>
    <em style="font-size:12px; color:#666;">Tap an option to reply. We read every response.</em>
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

    const socialPrompt = `You are writing social media posts to promote The Florida Flow, a free South Florida ocean conditions app and daily newsletter. The posts tease what's in today's data to drive people to the app. Voice: knowledgeable local, short sentences, real talk. NEVER use em dashes (--) anywhere in any post. Use a comma or period instead.

TODAY IS ${etLong}.

=== LIVE BUOY DATA (from this morning) ===
${buoySummary}

=== NWS MARINE FORECAST ===
${forecast.forecast?.slice(0, 800) || 'Unavailable'}

=== WHAT IS LIVE VS STALE ===
- Buoy data (seas, water temp, wind) = live from this morning. Use these freely.
- NWS forecast = current. Use it.
- Operator reports = IGNORE COMPLETELY unless dated ${etShort} or ${new Date(Date.now() - 86400000).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric' })}. If older, pretend they don't exist. Do not mention them.
- You have NO live visibility data. Never mention viz.

=== HOOK RULES (apply to every post — this is the most important part) ===
The hook is the only thing that determines whether someone stops scrolling. Research shows the highest-performing hooks do one of these:

1. CONTRAST: Split the audience or split geography. "BHB is flat right now. The Space Coast is not."
2. COUNTERINTUITIVE FACT: Say something that contradicts what people assume. "The roughest water in South Florida today isn't offshore — it's [location]."
3. SPECIFIC NUMBER THAT MEANS SOMETHING: Not "water is warm" — "79°F at the Keys buoy, warmest it's been in 6 weeks."
4. STAKES / CONSEQUENCE: What happens if they miss this info. "There's a 30 kt shower moving toward the coast right now. ETA 2 hours."
5. INSIDER SIGNAL: Only someone who actually watches these waters would say this. "That 8-second period on buoy 41009 means the swell is groundswell, not wind chop. Different feel in the water entirely."
6. QUESTION THAT CREATES TENSION: "Why is the Keys showing 2 ft while Fort Lauderdale shows 5? Here's the reason."

NEVER start with: "Water temps are...", "Conditions are...", "Good morning...", "Today's update...", "Here's what's happening..." — these are weather report openers. Nobody stops scrolling for those.
The hook must be complete as a sentence. No cliffhangers that require clicking to understand.

=== INSTRUCTIONS ===
Write 4 posts separated by exactly "---" on its own line.

POST 1 — X (Twitter) thread. 3 tweets separated by [TWEET].
- Purpose: hook people into checking the app with the most interesting number from today's live buoy data.
- Tweet 1 (≤260 chars): Strong hook using contrast, a surprising number, or tension. Not a summary — make them want to read the next tweet. End with 🧵
- Tweet 2 (≤270 chars): Regional breakdown — Space Coast / Treasure Coast / Gold Coast / Keys. Seas ft + water temp °F. Buoy distance in parens. Numbers only, no fluff.
- Tweet 3 (≤240 chars): The one forecast note that actually matters today (rain, wind shift, rough offshore, etc). End with: thefloridaflow.com
- No hashtags. Zero em dashes anywhere. No descriptive words ("glassy", "firing", "pumping", "pumping") unless buoy data directly supports them. "Glassy" = winds under 5 kt.

POST 2 — Facebook (Scuba/Diving groups). 100-150 words.
- Purpose: give divers a reason to check the app and subscribe to the newsletter.
- Open with a strong hook — a specific number or contrast that a diver would care about.
- Talk about water temps, sea state by region, and wind at BHB from live buoy data only.
- No operator reports. No viz claims. No mentions of what any dive shop saw.
- Naturally mention that the app has tides, dive windows, and current — without being pushy.
- End with: "Full conditions + tides + dive windows at thefloridaflow.com — free newsletter every morning."
- No hashtags. No em dashes. No descriptive condition words unless buoy numbers support them.

POST 3 — Facebook (General Florida groups). 80-120 words.
- Purpose: get everyday beach people to check the app.
- Audience: families, tourists, casual swimmers deciding if it's a good beach day. Not divers, not surfers.
- Open with a hook — water temp, a contrast between regions, or a heads-up about weather.
- Talk about water temp, whether conditions are rough or calm (based on actual buoy seas/wind), and any weather to watch for.
- No wave periods, no buoy IDs, no technical jargon.
- End with: "Daily ocean conditions at thefloridaflow.com — free."
- No hashtags. No em dashes. Two short paragraphs max.

POST 4 — Facebook (Fishing groups). 80-120 words.
- Purpose: get offshore and inshore fishers to check the app.
- Audience: people who fish — offshore, inshore, bridge, pier. They care about sea state for getting out, water temp (affects what's biting), wind, and any weather to avoid.
- Open with a hook about sea state or water temp that a fisher would actually care about.
- Report seas and water temp by region. That is all. Do not say which spot is "best" or make any judgment about where to fish. Fishermen know their boats and tolerance — give them the numbers and let them decide.
- No dive jargon, no viz, no BHB windows.
- End with: "Tides, currents, and full conditions at thefloridaflow.com — free daily newsletter."
- No hashtags. No em dashes. Two short paragraphs max.

POST 5 — Reddit (r/scubadiving, r/Florida, or r/spearfishing). 80-120 words.
- Purpose: genuine community contribution that happens to mention the app. Must not read like an ad.
- Framing: "I track this data daily and here's what I'm seeing" — not "check out my app."
- Open with the most interesting or surprising data point from today. Make it useful on its own, even without clicking anything.
- One natural mention of the app near the end, no hard sell.
- Suggest the most relevant subreddit in brackets at the top, e.g. [r/scubadiving].
- Casual tone, no jargon, no em dashes, no hashtags. Write like a local who dives or fishes, not a marketer.
- End with: "full data at thefloridaflow.com if useful"`

    const ghostPrompt = `You are generating the email body for Issue #${issueNumber} of The Florida Flow newsletter for ${etLong}.

Ghost CMS will wrap this in its own branded email template (header, footer, unsubscribe). Do NOT include: DOCTYPE, html, head, body, style tags, wrapper divs, masthead, or footer. Output ONLY the inner content with ALL styles inline on each element.

SAME LIVE DATA AS NEWSLETTER — use only what is below.

=== BUOY DATA ===
${buoySummary}

=== OPERATOR REPORTS ===
${operatorSummary}

=== BHB DIVE WINDOWS ===
${bhbSummary}

=== TIDE PREDICTIONS ===
${tidesSummary}

=== UV INDEX ===
${uvSummary}

=== CURRENTS ===
${currentSummary}

=== SUN TIMES ===
${sunSummary}

=== NWS MARINE FORECAST ===
${forecast.forecast?.slice(0, 800) || 'Unavailable'}

=== ACCURACY RULES ===
Same rules as main newsletter: data only, no judgment calls, offshore buoy readings are NOT nearshore, cite buoy distance, no NWS jargon.

=== OUTPUT FORMAT ===
Generate clean HTML using ONLY inline styles. No CSS classes. No style blocks. Every element MUST have explicit color set — never rely on inherited color. ALL body text must use color:#1a1a1a or color:#222. Generate ALL 11 sections completely — do not truncate or abbreviate.

BADGE STYLES — use these exactly on every data cell that has a value:
- Observed data: <span style="display:inline-block;background:#d5f5e3;color:#1e8449;font-size:10px;font-weight:bold;padding:2px 5px;border-radius:3px;margin-left:4px;">OBSERVED</span>
- Predicted/estimated: <span style="display:inline-block;background:#fef9e7;color:#b7770d;font-size:10px;font-weight:bold;padding:2px 5px;border-radius:3px;margin-left:4px;">PREDICTED</span>

TABLE CELL RULE — every td must be: <td style="padding:9px;border-bottom:1px solid #e8e8e8;vertical-align:top;color:#1a1a1a;font-family:Arial,sans-serif;">

SECTION HEADING: <h2 style="font-size:17px;font-weight:bold;font-family:Arial,sans-serif;color:#1a1a1a;border-bottom:2px solid #e0e0e0;padding-bottom:6px;margin:28px 0 12px 0;">

TABLE: <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;margin-bottom:16px;">
TH: <th style="background:#1a1a1a;color:#ffffff;padding:9px;text-align:left;white-space:nowrap;font-family:Arial,sans-serif;">

Wrap ALL output in this single outer div — do not omit it:
<div style="background:#ffffff;padding:24px 28px;border-radius:8px;max-width:680px;font-family:Arial,sans-serif;color:#1a1a1a;">

[ALL SECTIONS GO HERE]

</div>

Structure — generate ALL of these inside the wrapper, in order:
1. Advisory bar (only if active NWS advisory): <div style="background:#fef9e7;border-left:4px solid #e67e22;padding:12px 16px;margin-bottom:20px;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;color:#7d4a00;">⚠️ [text]</div>

2. Conditions: 3 paragraphs using <p style="font-size:15px;line-height:1.7;color:#222;margin-bottom:14px;font-family:Georgia,serif;">

3. App link: <p style="font-family:Arial,sans-serif;font-size:13px;color:#444;margin-bottom:24px;"><a href="https://thefloridaflow.com" style="color:#1a6fa0;font-weight:bold;">Check live conditions at thefloridaflow.com</a> — buoys, tides, dive windows, UV. Updated hourly.</p>

4. Regional table (8 regions, columns: Region / Seas / Period / Wind / Water Temp / Buoy). Seas and Water Temp from buoy data get OBSERVED badge. Estimated data gets PREDICTED badge.

5. Activity table (5 rows: 🤿 Scuba, 🏄 Surfing, 🚣 Kayak/SUP, ⛵ Boating/Fishing, 🏖️ Beach). Verdict column 1-2 words max (Good/Marginal/Elevated/Rough/Calm). Notes column full detail. Verdict cell: <td style="padding:9px;border-bottom:1px solid #e8e8e8;vertical-align:top;color:#1a1a1a;font-family:Arial,sans-serif;font-weight:bold;white-space:nowrap;">

6. Sightings: <div style="background:#eafaf1;border-left:4px solid #27ae60;padding:14px 16px;font-family:Arial,sans-serif;font-size:14px;color:#1a4a2a;line-height:1.65;margin:20px 0;">

7. Week outlook: <div style="background:#f9f9f6;border:1px solid #ddd;padding:16px;font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.9;margin:20px 0;">

8. Sun & UV: <p style="font-family:Arial,sans-serif;font-size:13px;color:#444;margin:20px 0;">☀️ Sunrise [time] · Sunset [time] · UV [index] ([label]) · Golden hour [morning range]</p>

9. Safety tip: <div style="background:#fdedec;border-left:4px solid #c0392b;padding:14px 16px;font-family:Arial,sans-serif;font-size:14px;color:#7b241c;line-height:1.65;margin:20px 0;"><strong style="color:#7b241c;">[title]</strong><br><span style="color:#7b241c;">[2-3 sentences]</span></div>

10. Poll: <div style="background:#f0f4ff;border-left:4px solid #3a6fa0;padding:16px;font-family:Arial,sans-serif;font-size:14px;color:#1a2a4a;margin:20px 0;"><strong style="display:block;color:#1a2a4a;margin-bottom:12px;">[question]</strong> then 4 mailto links: <a href="mailto:hello@thefloridaflow.com?subject=Poll: [option]" style="display:block;background:#fff;border:1px solid #c0d0e8;border-radius:6px;padding:10px 14px;margin-bottom:8px;color:#1a2a4a;text-decoration:none;">👉 [option]</a></div>

11. Disclaimer: <p style="font-size:11px;color:#888;font-family:Arial,sans-serif;line-height:1.6;margin-top:24px;border-top:1px solid #e0e0e0;padding-top:16px;">The Florida Flow aggregates NOAA forecasts and buoy data. All offshore sea heights are from buoys 20–60 nm offshore. Nearshore conditions vary. Always confirm with your captain or operator. Use at your own risk.</p>

Output only the HTML. No markdown, no commentary. Generate every section completely.`

    // Run all three Claude calls in parallel
    const [message, socialMessage, ghostMessage] = await Promise.all([
      anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8096,
        messages: [{ role: 'user', content: prompt }],
      }),
      anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2800,
        messages: [{ role: 'user', content: socialPrompt }],
      }),
      anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8096,
        messages: [{ role: 'user', content: ghostPrompt }],
      }),
    ])

    const draftContent = message.content[0].type === 'text' ? message.content[0].text : ''
    if (!draftContent) return NextResponse.json({ error: 'Claude returned empty response' }, { status: 500 })

    const socialContent = socialMessage.content[0].type === 'text' ? socialMessage.content[0].text : ''
    const ghostRaw      = ghostMessage.content[0].type === 'text'  ? ghostMessage.content[0].text  : ''
    const ghostContent  = ghostRaw || draftContent

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
        body: JSON.stringify({ posts: [{ title, html, status: 'draft', email_segment: 'all' }] }),
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) return `Ghost API ${res.status}: ${await res.text()}`
      return null
    }

    // Commit newsletter, social posts, and Ghost body in parallel; push draft to Ghost
    const [ghErr1, ghErr2, ghErr3, ghostError] = await Promise.all([
      commitToGitHub(`drafts/${etDate}.html`, draftContent, `newsletter draft ${etDate} (issue #${issueNumber})`),
      socialContent ? commitToGitHub(`drafts/${etDate}-social.md`, socialMarkdown, `social posts ${etDate}`) : Promise.resolve(null),
      commitToGitHub(`drafts/${etDate}-ghost.html`, ghostContent, `ghost body ${etDate} (issue #${issueNumber})`),
      publishToGhost(ghostContent, `The Florida Flow — Issue #${issueNumber} · ${etShort}`),
    ])

    return NextResponse.json({ ok: true, draft: `drafts/${etDate}.html`, ghostDraft: `drafts/${etDate}-ghost.html`, social: `drafts/${etDate}-social.md`, date: etDate, issue: issueNumber, githubErrors: [ghErr1, ghErr2, ghErr3].filter(Boolean), ghostError: ghostError ?? 'ok' })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
