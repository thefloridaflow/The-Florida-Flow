import { NextResponse } from 'next/server'

export type BHBHighTide = {
  time: string           // "07:13 AM"
  height: string         // "2.7"
  quality: 'optimal' | 'good' | 'fair'
  windowStart: string    // "06:43 AM"
  windowEnd: string      // "07:43 AM"
}

export type BHBDay = {
  label: string          // "Today" | "Tomorrow" | "Wed 4/2"
  date: string           // "04/01"
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

function cellQuality(cellHtml: string): 'optimal' | 'good' | 'fair' {
  if (cellHtml.includes('tblgreat')) return 'optimal'
  if (cellHtml.includes('tblgood'))  return 'good'
  return 'fair'
}

function cellText(cellHtml: string): string {
  return cellHtml.replace(/<[^>]+>/g, '').replace(/\*+/g, '').trim()
}

function dayLabel(dateStr: string, todayStr: string, tomorrowStr: string): string {
  if (dateStr === todayStr) return 'Today'
  if (dateStr === tomorrowStr) return 'Tomorrow'
  // dateStr is "MM/DD Day" — extract "Day M/D"
  const parts = dateStr.split(' ')
  return parts.length >= 2 ? `${parts[1]} ${parts[0]}` : dateStr
}

async function fetchMonth(year: number, month: number): Promise<string> {
  const mm = String(month).padStart(2, '0')
  const url = `https://www.idiveflorida.com/BlueHeronBridgeTideChartYM/${year}/${mm}.html`
  const res = await fetch(url, { next: { revalidate: 3600 * 12 }, signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

export async function GET() {
  try {
    const now = new Date()
    const etOpts = { timeZone: 'America/New_York' } as const
    const etYear  = parseInt(now.toLocaleDateString('en-US', { ...etOpts, year: 'numeric' }))
    const etMonth = parseInt(now.toLocaleDateString('en-US', { ...etOpts, month: 'numeric' }))
    const etDay   = parseInt(now.toLocaleDateString('en-US', { ...etOpts, day: 'numeric' }))

    const todayStr    = `${String(etMonth).padStart(2,'0')}/${String(etDay).padStart(2,'0')}`
    const tomorrow    = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tmMonth = parseInt(tomorrow.toLocaleDateString('en-US', { ...etOpts, month: 'numeric' }))
    const tmDay   = parseInt(tomorrow.toLocaleDateString('en-US', { ...etOpts, day: 'numeric' }))
    const tomorrowStr = `${String(tmMonth).padStart(2,'0')}/${String(tmDay).padStart(2,'0')}`

    // Fetch current month; also next month if we're in last 3 days
    const htmls: string[] = [await fetchMonth(etYear, etMonth)]
    if (etDay >= 29) {
      const nm = etMonth === 12 ? 1 : etMonth + 1
      const ny = etMonth === 12 ? etYear + 1 : etYear
      try { htmls.push(await fetchMonth(ny, nm)) } catch { /* ok */ }
    }
    const html = htmls.join('\n')

    // Parse all tbldata rows
    const rowRe = /<tr\s+class="tbldata">([\s\S]*?)<\/tr>/g
    const days: BHBDay[] = []
    let match: RegExpExecArray | null

    // Collect today and tomorrow only
    const targets = new Set([todayStr, tomorrowStr])

    while ((match = rowRe.exec(html)) !== null) {
      const cells = [...match[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)]
      if (cells.length < 5) continue

      const rawDate = cellText(cells[0][0])         // "03/30 Mon"
      const dateKey = rawDate.split(' ')[0]          // "03/30"
      if (!targets.has(dateKey)) continue

      // Cells: 0=date, 1=1stHighTime, 2=1stHighFt, 3=2ndHighTime, 4=2ndHighFt, ...
      const highPairs = [
        { timeCellHtml: cells[1][0], ftCellHtml: cells[2][0] },
        { timeCellHtml: cells[3][0], ftCellHtml: cells[4][0] },
      ]

      const tides: BHBHighTide[] = highPairs
        .map(({ timeCellHtml, ftCellHtml }) => {
          const time = cellText(timeCellHtml)
          const height = cellText(ftCellHtml)
          const quality = cellQuality(timeCellHtml)
          return { time, height, quality, windowStart: shiftTime(time, -30), windowEnd: shiftTime(time, 30) }
        })
        .filter(t => t.time.length > 0)

      days.push({ label: dayLabel(rawDate, todayStr, tomorrowStr), date: dateKey, tides })
    }

    return NextResponse.json(days)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
