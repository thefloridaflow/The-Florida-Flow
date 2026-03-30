import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { fetchAllBuoys, fetchTides, fetchMarineForecast, fetchUVIndex, fetchCurrents } from '@/lib/noaa'

const REGIONS = [
  { name: 'Space Coast',              buoyId: '41009'  },
  { name: 'Treasure Coast / Jupiter', buoyId: '41114'  },
  { name: 'Blue Heron Bridge',        buoyId: 'LKWF1'  },
  { name: 'Palm Beach / Singer Island', buoyId: 'LKWF1' },
  { name: 'Deerfield / Pompano',      buoyId: '41122'  },
  { name: 'Fort Lauderdale',          buoyId: '41122'  },
  { name: 'Miami / Key Biscayne',     buoyId: '41122'  },
  { name: 'Florida Keys',             buoyId: '42095'  },
]

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const githubToken  = process.env.GITHUB_TOKEN
  if (!anthropicKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 503 })
  if (!githubToken)  return NextResponse.json({ error: 'GITHUB_TOKEN not set' }, { status: 503 })

  // Today's date in ET
  const now = new Date()
  const etDate = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) // YYYY-MM-DD
  const etLong  = now.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  // Fetch BHB dive windows
  let bhbText = 'No BHB dive window data available.'
  try {
    const bhbRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://the-florida-flow.vercel.app'}/api/bhb-tides`, { signal: AbortSignal.timeout(10000) })
    if (bhbRes.ok) {
      const bhbDays = await bhbRes.json()
      if (Array.isArray(bhbDays) && bhbDays.length > 0) {
        bhbText = bhbDays.map((day: { label: string; tides: { time: string; quality: string; windowStart: string; windowEnd: string; height: string }[] }) =>
          `${day.label}:\n` + day.tides.map((t) =>
            `  ${t.time} (${t.height} ft) — ${t.quality} · Window: ${t.windowStart}–${t.windowEnd}`
          ).join('\n')
        ).join('\n')
      }
    }
  } catch { /* use fallback */ }

  // Fetch all ocean data
  const [buoys, tides, forecast, uv, current] = await Promise.all([
    fetchAllBuoys(),
    fetchTides(),
    fetchMarineForecast(),
    fetchUVIndex(),
    fetchCurrents(),
  ])

  const byId = Object.fromEntries(buoys.map(b => [b.stationId, b]))

  const regionalSummary = REGIONS.map(({ name, buoyId }) => {
    const b = byId[buoyId]
    if (!b || b.error) return `${name}: no data`
    const waves  = b.waveHeight  ? `${b.waveHeight} ft` : '— (inshore)'
    const period = b.wavePeriod  ? `${b.wavePeriod}s`   : '—'
    const wind   = b.windSpeed   ? `${b.windSpeed} kt ${b.windDir ?? ''}`.trim() : '—'
    const temp   = b.waterTemp   ? `${b.waterTemp}°F`   : '—'
    return `${name}: waves=${waves} period=${period} wind=${wind} water=${temp}`
  }).join('\n')

  const prompt = `You are writing the daily edition of The Florida Flow newsletter for ${etLong}.

Here is today's live ocean data:

REGIONAL CONDITIONS:
${regionalSummary}

BHB DIVE WINDOWS:
${bhbText}

UV INDEX: Today ${uv.uvIndex} (${uv.uvIndex >= 8 ? 'UV Alert' : uv.uvIndex >= 6 ? 'High' : uv.uvIndex >= 3 ? 'Moderate' : 'Low'}), Tomorrow ${uv.uvIndexTomorrow}

CURRENTS (Port Everglades): ${current.error ? 'unavailable' : `${current.speed} kt ${current.direction}`}

NWS MARINE FORECAST:
${forecast.forecast || 'Unavailable'}

TIDE PREDICTIONS (today + tomorrow, Lake Worth / BHB station):
${tides.predictions.slice(0, 8).map(p => `  ${p.time} ${p.type === 'H' ? 'High' : 'Low'} ${p.height} ft`).join('\n')}

Write the newsletter in EXACTLY this format — no deviations:

---
subject: The Florida Flow — [Day], [Month Date] | [one-line conditions summary]
---

# The Florida Flow
### ${etLong} · South Florida Ocean Report

---

**Today at a glance:** [2–3 sentences on overall conditions — calm or rough? Good viz or bad? Worth going out?]

---

## 🌊 Regional Conditions

| Region | Waves | Period | Wind | Water Temp | Viz Est. | Verdict |
|--------|-------|--------|------|------------|----------|---------|
[8 rows — Space Coast, Treasure Coast / Jupiter, Blue Heron Bridge, Palm Beach / Singer Island, Deerfield / Pompano, Fort Lauderdale, Miami / Key Biscayne, Florida Keys]

Viz: <1ft→40–80ft, 1–2ft→25–50ft, 2–3ft→10–25ft, 3–4.5ft→3–15ft, >4.5ft→0–5ft. Period >12s adds +10/+15ft, <6s subtracts 8ft.
Verdict: <2ft=Good, 2–4ft=Marginal, >4ft=Rough. Inshore (no waves): wind <12kt=Good, 12–20kt=Marginal, >20kt=Rough.

---

## 🤿 Blue Heron Bridge Dive Windows

[List today's high tides with windows and quality from BHB data above. If no optimal/good windows today, mention tomorrow's instead.]

Enter 30 min before high tide, exit 30 min after.

---

## 🐠 What's in the Water

[2–3 sentences about seasonal marine life for South Florida right now. Be specific to the month. March/April: mantas, sailfish, bull sharks near beaches, sea turtles active, lobster season ends Mar 31. Always: reef fish, dolphins, possible goliath grouper at wrecks.]

---

## 🏄 Activity Verdicts

**Diving:** [Good/Marginal/Poor] — [one sentence]
**Snorkeling:** [Good/Marginal/Poor] — [one sentence]
**Surfing:** [Good/Marginal/Poor] — [one sentence]
**Offshore Fishing:** [Good/Marginal/Poor] — [one sentence]
**Kayaking/SUP:** [Good/Marginal/Poor] — [one sentence]

---

## 📅 Week Outlook

[2–3 sentences on the next few days based on the NWS forecast text. Best day to go out this week?]

---

## ⚠️ Safety Tip of the Day

[One practical tip relevant to today's conditions.]

---

## 📬 Refer a Friend

Know someone who loves South Florida diving, fishing, or watersports?
**https://florida-flow-c2ae83.beehiiv.com/subscribe?ref=ySxwobpxV8**

Check live conditions: **https://the-florida-flow.vercel.app**

---
*Data: NOAA NDBC, NOAA Tides & Currents, NWS, Open-Meteo, iDiveFlorida. Sent daily at 5am ET.*`

  const anthropic = new Anthropic({ apiKey: anthropicKey })
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  const draftContent = message.content[0].type === 'text' ? message.content[0].text : ''
  if (!draftContent) {
    return NextResponse.json({ error: 'Claude returned empty response' }, { status: 500 })
  }

  // Commit draft to GitHub
  const path = `drafts/${etDate}.md`
  const apiUrl = `https://api.github.com/repos/thefloridaflow/The-Florida-Flow/contents/${path}`

  let sha: string | undefined
  try {
    const check = await fetch(apiUrl, {
      headers: { Authorization: `token ${githubToken}`, Accept: 'application/vnd.github+json' },
    })
    if (check.ok) sha = (await check.json()).sha
  } catch { /* new file */ }

  const putBody: Record<string, string> = {
    message: `newsletter draft ${etDate}`,
    content: Buffer.from(draftContent).toString('base64'),
  }
  if (sha) putBody.sha = sha

  const put = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      Authorization: `token ${githubToken}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(putBody),
  })

  if (!put.ok) {
    const err = await put.text()
    return NextResponse.json({ error: `GitHub commit failed: ${err}` }, { status: 502 })
  }

  return NextResponse.json({ ok: true, draft: path, date: etDate })
}
