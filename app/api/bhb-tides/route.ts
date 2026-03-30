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

// Quality: CSS class tblgreat/tblgood OR asterisk markers ** / *
function cellQuality(cellHtml: string): 'optimal' | 'good' | 'fair' {
  if (cellHtml.includes('tblgreat') || cellHtml.includes('**')) return 'optimal'
  if (cellHtml.includes('tblgood')  || /(?<!\*)\*(?!\*)/.test(cellHtml)) return 'good'
  return 'fair'
}

function cellText(cellHtml: string): string {
  return cellHtml.replace(/<[^>]+>/g, '').replace(/\*+/g, '').trim()
}

function dayLabel(dateStr: string, todayStr: string, tomorrowStr: string): string {
  if (dateStr === todayStr) return 'Today'
  if (dateStr === tomorrowStr) return 'Tomorrow'
  const parts = dateStr.split(' ')
  return parts.length >= 2 ? `${parts[1]} ${parts[0]}` : dateStr
}

export async function GET() {
  try {
    const now = new Date()
    const etOpts = { timeZone: 'America/New_York' } as const
    const etMonth = parseInt(now.toLocaleDateString('en-US', { ...etOpts, month: 'numeric' }))
    const etDay   = parseInt(now.toLocaleDateString('en-US', { ...etOpts, day: 'numeric' }))

    const todayStr    = `${String(etMonth).padStart(2,'0')}/${String(etDay).padStart(2,'0')}`
    const tomorrow    = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tmMonth = parseInt(tomorrow.toLocaleDateString('en-US', { ...etOpts, month: 'numeric' }))
    const tmDay   = parseInt(tomorrow.toLocaleDateString('en-US', { ...etOpts, day: 'numeric' }))
    const tomorrowStr = `${String(tmMonth).padStart(2,'0')}/${String(tmDay).padStart(2,'0')}`

    const url = 'https://idiveflorida.com/BlueHeronBridgeTideTableChart.php'
    const res = await fetch(url, { next: { revalidate: 3600 * 6 }, signal: AbortSignal.timeout(10000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()

    const targets = new Set([todayStr, tomorrowStr])
    const rowRe = /<tr\s[^>]*class="tbldata"[^>]*>([\s\S]*?)<\/tr>|<tr>([\s\S]*?)<\/tr>/gi
    const days: BHBDay[] = []
    let match: RegExpExecArray | null

    while ((match = rowRe.exec(html)) !== null) {
      const inner = match[1] ?? match[2]
      const cells = [...inner.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)]
      if (cells.length < 3) continue

      const rawDate = cellText(cells[0][0])   // "03/30 Mon"
      const dateKey = rawDate.split(' ')[0]   // "03/30"
      if (!targets.has(dateKey)) continue

      // Table: 0=date, 1=1stHighTime, 2=1stHighFt, 3=2ndHighTime, 4=2ndHighFt
      // (low tide columns may follow, but we only need highs)
      const highPairs = [
        cells[1] && cells[2] ? { timeCellHtml: cells[1][0], ftCellHtml: cells[2][0] } : null,
        cells[3] && cells[4] ? { timeCellHtml: cells[3][0], ftCellHtml: cells[4][0] } : null,
      ].filter(Boolean) as { timeCellHtml: string; ftCellHtml: string }[]

      const tides: BHBHighTide[] = highPairs
        .map(({ timeCellHtml, ftCellHtml }) => {
          const time   = cellText(timeCellHtml)
          const height = cellText(ftCellHtml)
          if (!time || !time.match(/\d+:\d+/)) return null
          const quality = cellQuality(timeCellHtml + ftCellHtml)
          return { time, height, quality, windowStart: shiftTime(time, -30), windowEnd: shiftTime(time, 30) }
        })
        .filter(Boolean) as BHBHighTide[]

      if (tides.length > 0) {
        days.push({ label: dayLabel(rawDate, todayStr, tomorrowStr), date: dateKey, tides })
      }
    }

    return NextResponse.json(days)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
