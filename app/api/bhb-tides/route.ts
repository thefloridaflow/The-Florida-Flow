import { NextResponse } from 'next/server'

export type BHBHighTide = {
  time: string           // "07:13 AM"
  height: string         // "2.7"
  quality: 'optimal' | 'good' | 'fair'
  windowStart: string    // "06:43 AM"
  windowEnd: string      // "07:43 AM"
}

export type BHBDay = {
  label: string          // "Today" | "Tomorrow"
  date: string           // "03/30"
  tides: BHBHighTide[]
}

function shiftTime(timeStr: string, mins: number): string {
  const m = timeStr.match(/(\d+):(\d+)\s+(AM|PM)/i)
  if (!m) return timeStr
  let h = parseInt(m[1]), min = parseInt(m[2])
  const ap = m[3].toUpperCase()
  let total = (ap === 'PM' && h !== 12 ? h + 12 : ap === 'AM' && h === 12 ? 0 : h) * 60 + min + mins
  total = ((total % 1440) + 1440) % 1440
  const hh = Math.floor(total / 60), mm = total % 60
  const newAp = hh >= 12 ? 'PM' : 'AM'
  const disp = hh > 12 ? hh - 12 : hh === 0 ? 12 : hh
  return `${disp}:${String(mm).padStart(2, '0')} ${newAp}`
}

// Quality from raw cell text — asterisks appear after the time: "08:37 AM *" or "10:29 AM **"
function qualityFromText(raw: string): 'optimal' | 'good' | 'fair' {
  if (raw.includes('**')) return 'optimal'
  if (raw.includes('*'))  return 'good'
  return 'fair'
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

function dayLabel(dateKey: string, todayStr: string, tomorrowStr: string): string {
  if (dateKey === todayStr) return 'Today'
  if (dateKey === tomorrowStr) return 'Tomorrow'
  return dateKey
}

async function fetchTable(year: number, month: number, day: number): Promise<string> {
  const url = 'https://idiveflorida.com/BlueHeronBridgeTideTableChart.php'

  // Try POST with form fields first
  const formBody = new URLSearchParams({
    startYear:  String(year),
    startMonth: String(month),
    startDay:   String(day),
    numDays:    '2',
  })
  const postRes = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody.toString(),
    next: { revalidate: 3600 * 6 },
    signal: AbortSignal.timeout(10000),
  })
  if (postRes.ok) {
    const html = await postRes.text()
    // If the response contains a data row with our date, use it
    if (html.includes(`${String(month).padStart(2,'0')}/${String(day).padStart(2,'0')}`)) {
      return html
    }
  }

  // Fallback: plain GET (page defaults to ~today)
  const getRes = await fetch(url, {
    next: { revalidate: 3600 * 6 },
    signal: AbortSignal.timeout(10000),
  })
  if (!getRes.ok) throw new Error(`HTTP ${getRes.status}`)
  return getRes.text()
}

export async function GET() {
  try {
    const now = new Date()
    const etOpts = { timeZone: 'America/New_York' } as const
    const etYear  = parseInt(now.toLocaleDateString('en-US', { ...etOpts, year:  'numeric' }))
    const etMonth = parseInt(now.toLocaleDateString('en-US', { ...etOpts, month: 'numeric' }))
    const etDay   = parseInt(now.toLocaleDateString('en-US', { ...etOpts, day:   'numeric' }))

    const todayStr    = `${String(etMonth).padStart(2,'0')}/${String(etDay).padStart(2,'0')}`
    const tomorrow    = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tmMonth = parseInt(tomorrow.toLocaleDateString('en-US', { ...etOpts, month: 'numeric' }))
    const tmDay   = parseInt(tomorrow.toLocaleDateString('en-US', { ...etOpts, day:   'numeric' }))
    const tomorrowStr = `${String(tmMonth).padStart(2,'0')}/${String(tmDay).padStart(2,'0')}`

    const html = await fetchTable(etYear, etMonth, etDay)

    const targets = new Set([todayStr, tomorrowStr])
    const days: BHBDay[] = []

    // Match every <tr> and check if first cell is a MM/DD date
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
    let match: RegExpExecArray | null

    while ((match = rowRe.exec(html)) !== null) {
      const cells = [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      if (cells.length < 5) continue

      const rawDate = stripTags(cells[0][0])              // "03/30 Mon" or "2026"
      const dateKey = rawDate.match(/^(\d{2}\/\d{2})/)?.[1]
      if (!dateKey || !targets.has(dateKey)) continue

      // Col layout: 0=date, 1=1stHighTime, 2=1stHighFt, 3=2ndHighTime, 4=2ndHighFt
      // (low tide cols follow but we only need highs)
      const highPairs = [
        { timeRaw: stripTags(cells[1][0]), ftRaw: stripTags(cells[2][0]) },
        { timeRaw: stripTags(cells[3][0]), ftRaw: stripTags(cells[4][0]) },
      ]

      const tides: BHBHighTide[] = highPairs
        .map(({ timeRaw, ftRaw }) => {
          // timeRaw may be "07:13 AM", "08:37 AM *", "10:29 AM **", or "--"
          if (!timeRaw || timeRaw === '--') return null
          const quality = qualityFromText(timeRaw)
          const time    = timeRaw.replace(/\*+/g, '').trim()
          const height  = ftRaw.replace(/\*+/g, '').trim()
          if (!time.match(/\d+:\d+\s*(AM|PM)/i)) return null
          return { time, height, quality, windowStart: shiftTime(time, -30), windowEnd: shiftTime(time, 30) }
        })
        .filter(Boolean) as BHBHighTide[]

      if (tides.length > 0) {
        days.push({ label: dayLabel(dateKey, todayStr, tomorrowStr), date: dateKey, tides })
      }
    }

    return NextResponse.json(days)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
