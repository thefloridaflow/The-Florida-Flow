import { NextResponse } from 'next/server'

export type OperatorReport = {
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
  stale?: boolean
}

function isStale(dateStr: string): boolean {
  if (!dateStr) return true
  // Normalize: remove ordinal suffixes (1st, 2nd, 3rd, 4th...)
  const normalized = dateStr.replace(/(\d+)(st|nd|rd|th)/gi, '$1')
  // Handle "TUESDAY 3/31" → assume current year
  const slashMatch = normalized.match(/(\d{1,2})\/(\d{1,2})/)
  let parsed: Date | null = null
  if (slashMatch) {
    const year = new Date().getFullYear()
    parsed = new Date(`${year}-${slashMatch[1].padStart(2,'0')}-${slashMatch[2].padStart(2,'0')}T00:00:00`)
  } else {
    parsed = new Date(normalized)
  }
  if (isNaN(parsed.getTime())) return true
  return Date.now() - parsed.getTime() > 48 * 60 * 60 * 1000
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&deg;/g, '°').replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Text immediately before a given <h4> label — useful for Rainbow Reef's layout
// where the value appears as a text node directly before its labeling <h4>.
function extractBeforeH4(html: string, h4Label: string): string {
  const re = new RegExp(`([\\s\\S]{1,400})<h4[^>]*>\\s*${h4Label}\\s*<\\/h4>`, 'i')
  const m = html.match(re)
  if (!m) return ''
  const parts = stripTags(m[1]).split(/\s{2,}/).map(s => s.trim()).filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

async function fetchNarcosis(): Promise<OperatorReport> {
  const url = 'https://narcosisdive.com/divelog.php'
  try {
    const res = await fetch(url, { next: { revalidate: 3600 * 3 }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()

    const dateMatch = html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)
    const date = dateMatch ? stripTags(dateMatch[1]) : ''

    let visibility = '', current = '', waterTemp = '', waves = ''
    const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi
    let m: RegExpExecArray | null
    while ((m = liRe.exec(html)) !== null) {
      const text = stripTags(m[1])
      if (/^Visibility:/i.test(text))       visibility = text.replace(/^Visibility:\s*/i, '')
      else if (/^Current:/i.test(text))     current    = text.replace(/^Current:\s*/i, '')
      else if (/^Water\s*Temp:/i.test(text)) waterTemp = text.replace(/^Water\s*Temp:\s*/i, '')
      else if (/^Waves:/i.test(text))       waves      = text.replace(/^Waves:\s*/i, '')
    }

    // Sightings/notes live in <div class="divelog">
    let notes = ''
    const divelogMatch = html.match(/<div[^>]*class="divelog"[^>]*>([\s\S]*?)<\/div>/i)
    if (divelogMatch) {
      notes = stripTags(divelogMatch[1]).substring(0, 200)
    }
    if (!notes) {
      const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi
      let m2: RegExpExecArray | null
      while ((m2 = pRe.exec(html)) !== null) {
        const text = stripTags(m2[1])
        if (text.length > 25 && !/^(Visibility|Current|Water|Waves|Skies|Air|Seas|Time)/i.test(text)) {
          notes = text.substring(0, 200)
          break
        }
      }
    }

    return { operator: 'Narcosis Dive', location: 'West Palm Beach', date, visibility, current, waterTemp, waves, notes, url }
  } catch {
    return { operator: 'Narcosis Dive', location: 'West Palm Beach', date: '', url, error: true }
  }
}

async function fetchRainbowReef(): Promise<OperatorReport> {
  const url = 'https://www.rainbowreef.com/key-largo-diving-weather-report/'
  try {
    const res = await fetch(url, { next: { revalidate: 3600 * 3 }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()

    // Date comes from the first <h3> which holds "Vessel: Location Date, Time"
    const h3Match = html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)
    const h3Text  = h3Match ? stripTags(h3Match[1]) : ''
    const dateMatch = h3Text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d+\w*\s+\d{4}(?:,\s*\d+:\d+\s*[APap][Mm])?/)
    const date = dateMatch ? dateMatch[0] : h3Text.substring(0, 60)

    const rawViz = extractBeforeH4(html, 'Visibility')
    const visibility = rawViz.length < 60 ? rawViz : rawViz.replace(/[^\d\s\-–ftFT]/g, '').trim().substring(0, 30)
    const rawCurrent = extractBeforeH4(html, 'Current')
    const current = rawCurrent.length < 80 ? rawCurrent : rawCurrent.substring(0, 60)
    const rawWaves = extractBeforeH4(html, 'Wave Height')
    const waves = rawWaves.length < 40 ? rawWaves : rawWaves.replace(/[^\d\s\-–ftFT]/g, '').trim().substring(0, 20)

    // Captain's note comes after <em>From Captain...</em>
    const emMatch = html.match(/<em>From[^<]*<\/em>\s*([\s\S]*?)(?:<em>|<h[1-6]|<\/li>)/i)
    const notes = emMatch ? stripTags(emMatch[1]).substring(0, 130) : ''

    return { operator: 'Rainbow Reef', location: 'Key Largo', date, visibility, current, waves, notes, url }
  } catch {
    return { operator: 'Rainbow Reef', location: 'Key Largo', date: '', url, error: true }
  }
}

async function fetchForceE(): Promise<OperatorReport> {
  const url = 'https://www.force-e.com/marine-forecast/'
  try {
    const res = await fetch(url, { next: { revalidate: 3600 * 3 }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()

    // Isolate the BHB section (between the BHB comment and PALM BEACH COUNTY)
    const bhbMatch = html.match(/Blue Heron Bridge Conditions[\s\S]*?(?=PALM BEACH COUNTY|$)/i)
    const bhbSection = bhbMatch ? bhbMatch[0] : html

    // Date label e.g. "TUESDAY 3/31" — appears in any section
    const dateMatch = html.match(/(?:MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\s+\d+\/\d+/i)
    const date = dateMatch ? dateMatch[0] : ''

    // BHB visibility: <h1 ...>20'</h1>
    const vizMatch = bhbSection.match(/<h1[^>]*>\s*(\d[\d–\-]*)\s*'\s*<\/h1>/i)
    const visibility = vizMatch ? `${vizMatch[1]} ft` : ''

    // BHB water temp: <h1 ...>78°</h1>
    const tempMatch = bhbSection.match(/<h1[^>]*>\s*(\d{2,3})\s*°\s*<\/h1>/i)
    const waterTemp = tempMatch ? `${tempMatch[1]}°F` : ''

    // BHB open/closed status
    const openMatch = bhbSection.match(/>(OPEN|CLOSED)</i)
    const status = openMatch ? openMatch[1] : ''

    // Rough seas in Palm Beach or Broward
    const pbRough = /PALM BEACH[\s\S]{0,300}ROUGH SEAS/i.test(html)
    const bwRough = /BROWARD[\s\S]{0,300}ROUGH SEAS/i.test(html)
    const roughParts = []
    if (pbRough) roughParts.push('Palm Beach: rough seas')
    if (bwRough) roughParts.push('Broward: rough seas')
    const notes = [status ? `BHB: ${status}` : '', ...roughParts].filter(Boolean).join(' · ')

    return { operator: 'Force-E Scuba', location: 'Blue Heron Bridge / Palm Beach / Broward', date, visibility, waterTemp, notes, url }
  } catch {
    return { operator: 'Force-E Scuba', location: 'Blue Heron Bridge / Palm Beach / Broward', date: '', url, error: true }
  }
}

export async function GET() {
  const [narcosis, rainbow, forceE] = await Promise.all([fetchNarcosis(), fetchRainbowReef(), fetchForceE()])

  // JS-rendered sites — linked only, no server-side scraping possible
  const captainHooks: OperatorReport = {
    operator: "Captain Hook's Diving",
    location: 'Big Pine Key / Lower Keys',
    date: '',
    url: 'https://captainhooks.com/current-dive-conditions/',
    linkOnly: true,
  }
  const islandVenture: OperatorReport = {
    operator: 'Island Venture',
    location: 'Key Largo',
    date: '',
    url: 'https://www.islandventure.com/key-largo-weather-report/',
    linkOnly: true,
  }
  const southpointDivers: OperatorReport = {
    operator: 'Southpoint Divers',
    location: 'Key West',
    date: '',
    url: 'https://southpointdivers.com/dive-conditions/',
    linkOnly: true,
  }
  const keyWestDiveCenter: OperatorReport = {
    operator: 'Key West Dive Center',
    location: 'Key West',
    date: '',
    url: 'https://www.keywestdivecenter.com/diving-conditions/',
    linkOnly: true,
  }
  // TODO: verify Looe Key Resort URL before enabling
  // const looeKeyResort: OperatorReport = {
  //   operator: 'Looe Key Reef Resort & Dive Center',
  //   location: 'Ramrod Key / Looe Key',
  //   date: '',
  //   url: 'https://TODO',
  //   linkOnly: true,
  // }

  narcosis.stale   = isStale(narcosis.date)
  rainbow.stale    = isStale(rainbow.date)
  forceE.stale     = isStale(forceE.date)

  return NextResponse.json([narcosis, rainbow, forceE, captainHooks, islandVenture, southpointDivers, keyWestDiveCenter])
}
