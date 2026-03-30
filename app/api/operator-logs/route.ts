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

    // Grab first substantial paragraph that isn't a conditions label
    let notes = ''
    const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi
    while ((m = pRe.exec(html)) !== null) {
      const text = stripTags(m[1])
      if (text.length > 25 && !/^(Visibility|Current|Water|Waves|Skies|Air|Seas|Time)/i.test(text)) {
        notes = text.substring(0, 130)
        break
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

export async function GET() {
  const [narcosis, rainbow] = await Promise.all([fetchNarcosis(), fetchRainbowReef()])

  // JS-rendered sites — linked only, no server-side scraping possible
  const captainHooks: OperatorReport = {
    operator: "Captain Hook's",
    location: 'Key West / Marathon / Looe Key',
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

  return NextResponse.json([narcosis, rainbow, captainHooks, islandVenture])
}
