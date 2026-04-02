import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createHmac } from 'crypto'
import { fetchAllBuoys, fetchMarineForecast, fetchUVIndex, fetchCurrents } from '@/lib/noaa'
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
    const appBase = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.thefloridaflow.com').replace('https://thefloridaflow.com', 'https://www.thefloridaflow.com')
    const [buoys, forecast, uv, current, operatorRes, bhbRes] = await Promise.all([
      fetchAllBuoys(),
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

    const ghostPrompt = `Generate the Ghost email body for Issue #${issueNumber}, ${etLong}. Ghost wraps this — output inner content only. ALL styles inline. No CSS classes, no style blocks.

DATA (use only this):
BUOYS: ${buoySummary}
OPERATORS: ${operatorSummary}
BHB WINDOWS: ${bhbSummary}
UV: ${uvSummary} | CURRENTS: ${currentSummary} | SUN: ${sunSummary}
FORECAST: ${forecast.forecast?.slice(0, 600) || 'Unavailable'}

RULES: Data only. No judgment calls. Offshore buoys (20-60nm) ≠ nearshore. Cite buoy distance. Plain English (no NWS jargon). NEVER use em dashes (—) anywhere. Use a comma, period, or colon instead.

RATING SCALE: CALM <1ft/<10kt | GOOD 1-2ft/<15kt | MARGINAL 2-3ft | CHOPPY 3-5ft/short period | ELEVATED 3-5ft/building | BUILDING worsening | ROUGH 5ft+/>25kt | ACTIVE SCA named advisory
Colors: green=#4ade80 (Calm/Good), orange=#fb923c (Marginal/Choppy/Elevated/Building), red=#f87171 (Rough/Active SCA)

VIS MODEL (PREDICTED unless operator confirms): <1ft+<10kt=40-80ft | 1-2ft+<15kt=20-50ft | 2-3ft/15-20kt=10-30ft | 3-5ft/>20kt=5-15ft | >5ft=<10ft. Onshore winds reduce one tier. BHB="Tidal 5-20ft".
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
11. Poll: background:#0f1f3d;border-left:4px solid #3b82f6;color:#bfdbfe — question + 4 mailto options (mailto:hello@thefloridaflow.com?subject=Poll:[option]) + "Tap to reply. We read every response."
11. Forward ask: background:#1e293b;border-left:4px solid #0ea5e9;color:#bae6fd — "Know someone on the water? Forward this to a diver, angler, or anyone Space Coast to Keys. Free every morning."
12. Disclaimer: font-size:11px;color:#475569;border-top:1px solid #1e293b;padding-top:16px — "The Florida Flow aggregates NOAA data. Offshore heights from buoys 20-60nm. Nearshore varies. Confirm with your captain. Use at your own risk."

Close wrapper div. Output HTML only. No markdown. No truncation.`

    // Run both Claude calls in parallel
    const [socialMessage, ghostMessage] = await Promise.all([
      anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2800,
        messages: [{ role: 'user', content: socialPrompt }],
      }),
      anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8192,
        messages: [{ role: 'user', content: ghostPrompt }],
      }),
    ])

    const socialContent = socialMessage.content[0].type === 'text' ? socialMessage.content[0].text : ''
    const ghostContent  = ghostMessage.content[0].type === 'text'  ? ghostMessage.content[0].text  : ''
    if (!ghostContent) return NextResponse.json({ error: 'Claude returned empty ghost response' }, { status: 500 })

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
