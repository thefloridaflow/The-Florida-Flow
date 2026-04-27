// Color tokens
const C = {
  PAPER: '#eef6f6', PAPER2: '#deedee', RULE: '#b8d4d4', RULE2: '#96bfbf',
  INK: '#1a2035', INK2: '#323855', INK3: '#5a6285', INK4: '#8890a8',
  ACCENT: '#2646c8', ACCENT_SOFT: '#cdd9f0',
  GOOD: '#2a8a58', GOOD_SOFT: '#d0f0e0',
  WARN: '#b87820', WARN_SOFT: '#f5e8c8',
  DANGER: '#b02818', DANGER_SOFT: '#f5d4cc',
} as const

const SERIF = `'Source Serif 4',Georgia,serif`
const SANS  = `'Inter Tight',-apple-system,BlinkMacSystemFont,Arial,sans-serif`
const MONO  = `'JetBrains Mono',ui-monospace,SFMono-Regular,monospace`
const DOW   = ['SUN','MON','TUE','WED','THU','FRI','SAT'] as const

// ---- Public types ----

export interface NewsletterJson {
  alert: {
    type: 'danger' | 'warn' | 'calm'
    badgeLabel?: string
    title: string
    titleItalic?: string
    subtitle: string
  }
  verdict: {
    todaysCall: string
    status: 'good' | 'warn' | 'danger'
    statusLabel: string
    bestWindow: string
    bestWindowSub: string
    seasNow: string
    seasSub: string
    water: string
    waterSub: string
  }
  lede: {
    headline: string
    headlineItalic?: string
    paragraphs: string[]
  }
  regions: Array<{
    state: 'good' | 'choppy' | 'rough' | 'nodata'
    stateLabel: string
    vis: string
    visObs: boolean
  }>
  activities: Array<{
    name: string
    verdict: 'good' | 'caution' | 'no'
    verdictLabel: string
    notes: string
  }>
  beach: {
    paragraphs: string[]
    ripRisk: 'low' | 'elevated' | 'high'
    flagColor: 'green' | 'yellow' | 'red'
    bestTimeNote?: string
  }
  bhbNote: string
  sightings: Array<{
    operator: string
    location: string
    quote: string
    vis?: string
    water?: string
  }>
  weekOutlook: Array<{
    verdict: 'good' | 'choppy' | 'rough'
    verdictLabel: string
    note: string
  }>
  safety: { title: string; body: string }
  poll: { question: string; options: [string, string, string, string] }
  meta: { subject: string; title: string; desc: string; excerpt: string }
}

export interface BuoyReading {
  stationId?: string
  waveHeight?: string
  wavePeriod?: string
  waterTemp?: string
  windSpeed?: string
  windDir?: string
  offshoreNm?: number
  error?: boolean
}

export interface BHBTide {
  time: string; height: string; quality: string; windowStart: string; windowEnd: string
}

export interface BHBDay { label: string; tides: BHBTide[] }

export interface TemplateCtx {
  issueNumber: number
  etLong: string
  etShort: string
  now: Date
  byId: Record<string, BuoyReading>
  bhbDays: BHBDay[]
  uv: { uvIndex: number; uvIndexTomorrow: number }
  current: { speed?: string; direction?: string; error?: boolean }
  sunrise: Date
  sunset: Date
  goldenMorningEnd: Date
  goldenEveningStart: Date
}

// ---- Helpers ----

const fmtET = (d: Date) =>
  d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' })

function sectionHeader(title: string, italic: string, meta: string) {
  return `<div style="margin-bottom:18px;padding-bottom:10px;border-bottom:1px solid ${C.RULE2};"><div style="font-family:${MONO};font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:${C.INK3};margin-bottom:6px;">${meta}</div><h3 style="font-family:${SERIF};font-weight:400;font-size:22px;letter-spacing:-0.01em;margin:0;color:${C.INK};">${title} <em style="font-style:italic;">${italic}</em></h3></div>`
}

function gridCell(label: string, value: string, noBorderRight = false) {
  return `<div style="padding:10px 14px;${noBorderRight ? '' : `border-right:1px solid ${C.RULE};`}"><div style="font-family:${MONO};font-size:9.5px;letter-spacing:0.12em;text-transform:uppercase;color:${C.INK3};margin-bottom:4px;">${label}</div><div style="font-family:${SERIF};font-size:18px;font-weight:500;color:${C.INK};letter-spacing:-0.01em;">${value}</div></div>`
}

function obsBadge(obs: boolean) {
  return obs
    ? `<span style="display:inline-block;font-family:${MONO};font-size:9px;letter-spacing:0.1em;padding:1px 5px;margin-left:4px;text-transform:uppercase;border:1px solid;border-radius:2px;vertical-align:middle;border-color:${C.GOOD};color:${C.GOOD};">OBS</span>`
    : `<span style="display:inline-block;font-family:${MONO};font-size:9px;letter-spacing:0.1em;padding:1px 5px;margin-left:4px;text-transform:uppercase;border:1px solid;border-radius:2px;vertical-align:middle;border-color:${C.INK4};color:${C.INK3};">PRED</span>`
}

const TABLE_REGIONS = [
  { name: 'Space Coast',      location: 'Cocoa Beach · 41009',     buoyId: '41009' },
  { name: 'Treasure Coast',   location: 'Vero / Ft Pierce · 41114',buoyId: '41114' },
  { name: 'Blue Heron Bridge',location: 'BHB · LKWF1',             buoyId: 'LKWF1' },
  { name: 'Palm Beach',       location: 'Singer Is. · LKWF1',      buoyId: 'LKWF1' },
  { name: 'Gold Coast',       location: 'Deerfield-Miami · 41122', buoyId: '41122' },
  { name: 'Upper Keys',       location: 'Key Largo · MLRF1',       buoyId: 'MLRF1', decommissioned: true },
  { name: 'Middle Keys',      location: 'Marathon · SMKF1',        buoyId: 'SMKF1' },
  { name: 'Lower Keys',       location: 'Key West · 42095',        buoyId: '42095' },
]

// ---- Main builder ----

export function buildNewsletterHtml(json: NewsletterJson, ctx: TemplateCtx): string {
  const { issueNumber, etLong, etShort, now, byId, bhbDays, uv, current, sunrise, sunset, goldenMorningEnd, goldenEveningStart } = ctx
  const weekday = now.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long' })

  // 1. MASTHEAD
  const masthead = `<header style="padding:28px 28px 20px;border-bottom:2px solid ${C.INK};">
<div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:20px;font-family:${MONO};font-size:10.5px;letter-spacing:0.14em;text-transform:uppercase;color:${C.INK3};padding-bottom:14px;border-bottom:1px solid ${C.RULE};margin-bottom:18px;">
<span><b style="color:${C.INK};">${weekday}</b> · ${etLong.replace(`${weekday}, `, '')} · Issue #${issueNumber}</span>
<span>thefloridaflow.com</span></div>
<h1 style="font-family:${SERIF};font-weight:300;font-style:italic;font-size:48px;line-height:0.95;letter-spacing:-0.02em;color:${C.INK};margin:0 0 14px;">The Florida Flow.</h1>
<p style="font-family:${SERIF};font-size:15px;font-style:italic;color:${C.INK3};margin:0;">The morning briefing for divers, anglers, and everyone on the water — Space Coast to Key West.</p>
</header>`

  // 2. VERDICT STRIP
  const v = json.verdict
  const vColor = v.status === 'good' ? C.GOOD : v.status === 'warn' ? C.WARN : C.DANGER
  const vBg    = v.status === 'good' ? C.GOOD_SOFT : v.status === 'warn' ? C.WARN_SOFT : C.DANGER_SOFT
  const verdictStrip = `<div style="display:grid;grid-template-columns:1.2fr 1fr 1fr 1fr;border-bottom:2px solid ${C.INK};">
<div style="padding:14px 20px;border-right:1px solid ${C.RULE};">
<div style="font-family:${MONO};font-size:9.5px;letter-spacing:0.14em;text-transform:uppercase;color:${C.INK3};margin-bottom:6px;">TODAY'S CALL</div>
<div style="font-family:${SERIF};font-size:16px;font-weight:500;line-height:1.25;color:${C.INK};">${v.todaysCall}</div>
<span style="display:inline-block;font-family:${SANS};font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;padding:2px 7px;margin-top:6px;border-radius:2px;background:${vBg};color:${vColor};">${v.statusLabel}</span>
</div>
<div style="padding:14px 20px;border-right:1px solid ${C.RULE};">
<div style="font-family:${MONO};font-size:9.5px;letter-spacing:0.14em;text-transform:uppercase;color:${C.INK3};margin-bottom:6px;">BEST WINDOW</div>
<div style="font-family:${SERIF};font-size:20px;font-weight:500;line-height:1.1;color:${C.INK};">${v.bestWindow}<small style="font-family:${SANS};font-size:11px;font-weight:500;color:${C.INK3};display:block;margin-top:3px;">${v.bestWindowSub}</small></div>
</div>
<div style="padding:14px 20px;border-right:1px solid ${C.RULE};">
<div style="font-family:${MONO};font-size:9.5px;letter-spacing:0.14em;text-transform:uppercase;color:${C.INK3};margin-bottom:6px;">SEAS NOW</div>
<div style="font-family:${SERIF};font-size:20px;font-weight:500;line-height:1.1;color:${C.INK};">${v.seasNow}<small style="font-family:${SANS};font-size:11px;font-weight:500;color:${C.INK3};display:block;margin-top:3px;">${v.seasSub}</small></div>
</div>
<div style="padding:14px 20px;">
<div style="font-family:${MONO};font-size:9.5px;letter-spacing:0.14em;text-transform:uppercase;color:${C.INK3};margin-bottom:6px;">WATER</div>
<div style="font-family:${SERIF};font-size:20px;font-weight:500;line-height:1.1;color:${C.INK};">${v.water}<small style="font-family:${SANS};font-size:11px;font-weight:500;color:${C.INK3};display:block;margin-top:3px;">${v.waterSub}</small></div>
</div>
</div>`

  // 3. ALERT BAR
  const al = json.alert
  let alertHtml: string
  if (al.type === 'calm') {
    alertHtml = `<div style="padding:18px 20px;border-bottom:1px solid ${C.RULE};background:${C.ACCENT_SOFT};border-left:4px solid ${C.ACCENT};">
<div style="font-family:${SERIF};font-size:16px;font-weight:500;color:${C.INK};line-height:1.4;">${al.title}${al.titleItalic ? ` <em style="font-style:italic;color:${C.ACCENT};">${al.titleItalic}</em>` : ''}<br><span style="font-family:${SANS};font-size:13.5px;font-weight:400;color:${C.INK2};">${al.subtitle}</span></div>
</div>`
  } else {
    const aColor = al.type === 'danger' ? C.DANGER : C.WARN
    const aBg    = al.type === 'danger' ? C.DANGER_SOFT : C.WARN_SOFT
    alertHtml = `<div style="padding:18px 20px;border-bottom:1px solid ${C.RULE};display:flex;gap:16px;align-items:flex-start;background:${aBg};border-left:4px solid ${aColor};">
<div style="width:44px;flex-shrink:0;border:1.5px solid ${aColor};color:${aColor};font-family:${MONO};font-size:9px;font-weight:600;letter-spacing:0.08em;text-align:center;padding:8px 4px;line-height:1.3;">⚠<br>${al.badgeLabel ?? 'WARN'}</div>
<div><p style="font-family:${SERIF};font-size:22px;font-weight:500;line-height:1.2;margin:0 0 4px;color:${C.INK};">${al.title}${al.titleItalic ? ` <em style="font-style:italic;color:${aColor};">${al.titleItalic}</em>` : ''}</p>
<p style="font-family:${SANS};font-size:13.5px;color:${C.INK2};margin:0;">${al.subtitle}</p></div>
</div>`
  }

  // 4. LEDE
  const ledeHeadline = json.lede.headlineItalic
    ? `${json.lede.headline} <em style="font-style:italic;">${json.lede.headlineItalic}</em>`
    : json.lede.headline

  const LEDE_BUOYS = [
    { id: '41009', label: '41009 · Space Coast' },
    { id: '41114', label: '41114 · Treasure Coast' },
    { id: 'LKWF1', label: 'LKWF1 · BHB' },
    { id: '41122', label: '41122 · Gold Coast' },
  ]
  const buoyStripCells = LEDE_BUOYS.map(({ id, label }, i) => {
    const b = byId[id]
    const val = b && !b.error
      ? (b.waveHeight ? `${b.waveHeight} ft` : b.windSpeed ? `${b.windSpeed} kt` : '—')
      : '—'
    const sub = b?.waterTemp ? `${b.waterTemp}°F` : ''
    return `<div style="padding:10px 12px;${i < 3 ? `border-right:1px solid ${C.RULE};` : ''}">
<div style="font-family:${MONO};font-size:9.5px;letter-spacing:0.1em;color:${C.INK3};text-transform:uppercase;">${label}</div>
<div style="font-family:${SERIF};font-size:18px;font-weight:500;color:${C.INK};line-height:1.1;margin-top:3px;">${val} <small style="font-family:${SANS};font-weight:500;font-size:10.5px;color:${C.INK3};">${sub}</small></div>
</div>`
  }).join('')

  const ledeSection = `<section style="padding:32px 28px 8px;">
<div style="margin-bottom:18px;"><span style="font-family:${MONO};font-size:10.5px;letter-spacing:0.14em;text-transform:uppercase;color:${C.INK3};padding-left:12px;border-left:2px solid ${C.INK3};">The Briefing</span></div>
<h2 style="font-family:${SERIF};font-weight:400;font-size:30px;line-height:1.18;letter-spacing:-0.015em;margin:0 0 18px;color:${C.INK};">${ledeHeadline}</h2>
${json.lede.paragraphs.map(p => `<p style="font-family:${SERIF};font-size:16.5px;line-height:1.6;color:${C.INK2};margin:0 0 14px;">${p}</p>`).join('')}
<div style="margin:22px 0 10px;border:1px solid ${C.RULE};display:grid;grid-template-columns:repeat(4,1fr);">${buoyStripCells}</div>
<a href="https://thefloridaflow.com/guide" style="display:block;margin:22px 0 8px;padding:18px 20px;background:${C.ACCENT_SOFT};border:1px solid ${C.ACCENT};border-left:3px solid ${C.ACCENT};text-decoration:none;color:${C.INK};">
<div style="font-family:${MONO};font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${C.ACCENT};margin-bottom:4px;">Featured · Dive site guide</div>
<div style="font-family:${SERIF};font-size:20px;font-weight:500;letter-spacing:-0.01em;color:${C.INK};line-height:1.15;margin-bottom:4px;">First time at <em style="font-style:italic;">Blue Heron Bridge?</em></div>
<div style="font-family:${SERIF};font-size:13.5px;color:${C.INK2};line-height:1.5;margin-bottom:14px;">56-page field guide — tide windows, entry points, critter map, offline tables. Everything you need for every dive.</div>
<div style="display:inline-block;padding:10px 16px;background:${C.INK};color:${C.PAPER};font-family:${SANS};font-size:13px;font-weight:600;letter-spacing:0.02em;">$12 · Get the guide →</div>
</a>
<p style="font-family:${MONO};font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:${C.INK3};margin:16px 0 0;"><a href="https://thefloridaflow.com" style="color:${C.ACCENT};font-weight:500;">thefloridaflow.com</a> — live buoys, tides, dive windows, UV. Updated hourly.</p>
</section>`

  // 5. REGIONAL TABLE
  const observedCount = TABLE_REGIONS.filter(r => {
    if ('decommissioned' in r) return false
    const b = byId[r.buoyId]
    return b && !b.error
  }).length

  const tableRows = TABLE_REGIONS.map((reg, i) => {
    const rj = json.regions[i] ?? { state: 'nodata', stateLabel: 'No data', vis: '—', visObs: false }
    if ('decommissioned' in reg && reg.decommissioned) {
      return `<tr>
<td style="padding:12px 10px 12px 0;border-bottom:1px solid ${C.RULE};vertical-align:top;"><span style="font-family:${SERIF};font-size:15px;font-weight:500;color:${C.INK};">${reg.name}</span><small style="display:block;font-family:${MONO};font-size:9.5px;color:${C.INK4};letter-spacing:0.06em;margin-top:2px;text-transform:uppercase;">${reg.location}</small></td>
<td colspan="5" style="padding:12px 10px 12px 0;border-bottom:1px solid ${C.RULE};font-family:${MONO};font-size:11px;color:${C.INK4};">No coverage — MLRF1 decommissioned Feb 2023</td></tr>`
    }
    const b = byId[reg.buoyId]
    const sc = rj.state === 'good' ? C.GOOD : rj.state === 'choppy' ? C.WARN : rj.state === 'rough' ? C.DANGER : C.INK4
    const seas = b?.waveHeight
      ? `<span style="font-family:${MONO};font-size:12.5px;color:${C.INK};white-space:nowrap;">${b.waveHeight} <span style="color:${C.INK4};">ft</span></span>${obsBadge(true)}`
      : `<span style="font-family:${MONO};font-size:12.5px;color:${C.INK4};">—</span>${obsBadge(false)}`
    const wind = b?.windSpeed
      ? `<span style="font-family:${MONO};font-size:12.5px;color:${C.INK};white-space:nowrap;">${b.windSpeed}${b.windDir ? ` ${b.windDir}` : ''} <span style="color:${C.INK4};">kt</span></span>`
      : `<span style="font-family:${MONO};font-size:12.5px;color:${C.INK4};">—</span>`
    const water = b?.waterTemp
      ? `<span style="font-family:${MONO};font-size:12.5px;color:${C.INK};white-space:nowrap;">${b.waterTemp}° <span style="color:${C.INK4};">F</span></span>`
      : `<span style="font-family:${MONO};font-size:12.5px;color:${C.INK4};">—</span>`
    return `<tr>
<td style="padding:12px 10px 12px 0;border-bottom:1px solid ${C.RULE};vertical-align:top;"><span style="font-family:${SERIF};font-size:15px;font-weight:500;color:${C.INK};">${reg.name}</span><small style="display:block;font-family:${MONO};font-size:9.5px;color:${C.INK4};letter-spacing:0.06em;margin-top:2px;text-transform:uppercase;">${reg.location}</small></td>
<td style="padding:12px 10px 12px 0;border-bottom:1px solid ${C.RULE};vertical-align:top;"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px;vertical-align:middle;background:${sc};"></span><span style="font-weight:600;white-space:nowrap;color:${sc};">${rj.stateLabel}</span></td>
<td style="padding:12px 10px 12px 0;border-bottom:1px solid ${C.RULE};vertical-align:top;"><span style="font-family:${MONO};font-size:12.5px;color:${C.INK};">${rj.vis}</span>${obsBadge(rj.visObs)}</td>
<td style="padding:12px 10px 12px 0;border-bottom:1px solid ${C.RULE};vertical-align:top;">${seas}</td>
<td style="padding:12px 10px 12px 0;border-bottom:1px solid ${C.RULE};vertical-align:top;">${wind}</td>
<td style="padding:12px 10px 12px 0;border-bottom:1px solid ${C.RULE};vertical-align:top;">${water}</td>
</tr>`
  }).join('')

  const th = (label: string) =>
    `<th style="font-family:${MONO};font-size:9.5px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:${C.INK3};text-align:left;padding:8px 10px 8px 0;border-bottom:2px solid ${C.INK};white-space:nowrap;">${label}</th>`

  const regionalTable = `<section style="padding:28px;border-top:1px solid ${C.RULE};">
${sectionHeader('Regional', 'conditions', `${TABLE_REGIONS.length} regions · ${observedCount} observed`)}
<table style="width:100%;border-collapse:collapse;font-family:${SANS};font-size:13px;">
<thead><tr>${th('Region')}${th('State')}${th('Vis')}${th('Seas')}${th('Wind')}${th('Water')}</tr></thead>
<tbody>${tableRows}</tbody></table>
<p style="font-family:${MONO};font-size:11px;color:${C.INK3};letter-spacing:0.06em;margin:12px 0 16px;line-height:1.6;">Sources: NDBC buoys 41009 (Space Coast, 20nm), 41114 (Treasure Coast, 6.5nm), LKWF1 (BHB inshore), 41122 (Gold Coast, 23nm), SMKF1 (Marathon, 1nm), 42095 (Key West, 15nm). Upper Keys: MLRF1 decommissioned Feb 2023. Offshore buoys ≠ nearshore — confirm with your captain.</p>
<div style="background:${C.GOOD_SOFT};border-left:3px solid ${C.GOOD};padding:14px 18px;font-family:${SERIF};font-size:14px;color:${C.INK};line-height:1.5;">First time at BHB? <a href="https://thefloridaflow.com/guide" style="color:${C.GOOD};font-weight:600;">The Florida Flow BHB Site Guide — Get it for $12 →</a></div>
</section>`

  // 6. ACTIVITY PLANNER
  const activityCards = json.activities.map(act => {
    const aColor = act.verdict === 'good' ? C.GOOD : act.verdict === 'caution' ? C.WARN : C.DANGER
    const aBg    = act.verdict === 'good' ? C.GOOD_SOFT : act.verdict === 'caution' ? C.WARN_SOFT : C.DANGER_SOFT
    return `<div style="border-right:1px solid ${C.RULE};border-bottom:1px solid ${C.RULE};padding:16px 18px;background:${C.PAPER};box-shadow:inset 3px 0 0 ${aColor};">
<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
<span style="font-family:${SERIF};font-size:17px;font-weight:500;color:${C.INK};">${act.name}</span>
<span style="font-family:${MONO};font-size:10px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;padding:2px 6px;border-radius:2px;background:${aBg};color:${aColor};">${act.verdictLabel}</span>
</div>
<p style="margin:0;font-size:13px;color:${C.INK2};line-height:1.5;">${act.notes}</p>
</div>`
  }).join('')

  const activityPlanner = `<section style="padding:28px;border-top:1px solid ${C.RULE};">
${sectionHeader('Activity', 'planner', `${weekday} · ${json.activities.length} activities`)}
<div style="display:grid;grid-template-columns:1fr 1fr;border-top:2px solid ${C.INK};border-left:1px solid ${C.RULE};">${activityCards}</div>
</section>`

  // 7. BEACH REPORT
  const flagColors: Record<string, string> = { green: C.GOOD, yellow: C.WARN, red: C.DANGER }
  const ripLabel: Record<string, string> = {
    low:      'Low rip current risk today.',
    elevated: '<strong>Rip current risk is elevated today. Swim near a lifeguard stand.</strong>',
    high:     '<strong>High rip current risk. Swim near a lifeguard stand.</strong>',
  }
  const beachReport = `<section style="padding:28px;border-top:1px solid ${C.RULE};background:${C.PAPER2};">
${sectionHeader('Beach', 'report', 'casual beachgoers · plain English')}
${json.beach.paragraphs.map(p => `<p style="font-family:${SERIF};font-size:15.5px;line-height:1.6;color:${C.INK};margin:0 0 12px;">${p}</p>`).join('')}
<p style="font-family:${SERIF};font-size:15.5px;line-height:1.6;color:${C.INK};margin:0 0 12px;">${ripLabel[json.beach.ripRisk]}</p>
<p style="font-family:${SERIF};font-size:15.5px;line-height:1.6;color:${C.INK};margin:0 0 12px;">Expect <span style="font-weight:600;color:${flagColors[json.beach.flagColor]};">${json.beach.flagColor}</span> flags (estimate from NOAA data — check posted flags on arrival).</p>
${json.beach.bestTimeNote ? `<p style="font-family:${SERIF};font-size:15.5px;line-height:1.6;color:${C.INK};margin:0 0 12px;">${json.beach.bestTimeNote}</p>` : ''}
<p style="font-family:${SERIF};font-size:15px;line-height:1.55;color:${C.INK2};margin:0;">Conditions change — always check posted flags and swim near a lifeguard.</p>
</section>`

  // 8. BHB DIVE WINDOWS
  const today = bhbDays[0]
  const lkwf  = byId['LKWF1']
  const bhbMeta = lkwf?.windSpeed ? `${lkwf.windSpeed} KT ${lkwf.windDir ?? ''}`.trim() : 'LKWF1'

  const tideCells = today?.tides[0]
    ? [
        gridCell('TODAY HIGH', today.tides[0].time),
        gridCell('HEIGHT', `${today.tides[0].height} ft`),
        gridCell('BEST WINDOW', `${today.tides[0].windowStart}–${today.tides[0].windowEnd}`),
        gridCell('QUALITY', today.tides[0].quality, true),
      ].join('')
    : gridCell('WINDOWS', 'No data available', true)

  const windowCards = (today?.tides ?? []).slice(0, 3).map((t, i) => {
    const isOptimal = /optimal|good/i.test(t.quality)
    const qBg    = isOptimal ? C.GOOD_SOFT : C.WARN_SOFT
    const qColor = isOptimal ? C.GOOD      : C.WARN
    return `<div style="padding:12px 14px;${i < 2 ? `border-right:1px solid ${C.RULE};` : ''}background:${isOptimal ? C.ACCENT_SOFT : C.PAPER};${isOptimal ? `box-shadow:inset 0 2px 0 ${C.ACCENT};` : ''}">
<div style="font-family:${SERIF};font-size:20px;font-weight:500;color:${C.INK};">${t.time}</div>
<div style="font-family:${MONO};font-size:9.5px;letter-spacing:0.08em;text-transform:uppercase;color:${C.INK3};margin-top:4px;">${t.height} ft · ${t.windowStart}–${t.windowEnd}</div>
<span style="display:inline-block;padding:1px 5px;border-radius:2px;font-size:9px;font-family:${MONO};background:${qBg};color:${qColor};margin-top:6px;">${isOptimal ? 'Optimal' : 'Fair'}</span>
</div>`
  }).join('')

  const bhbSection = `<section style="padding:28px;border-top:1px solid ${C.RULE};">
${sectionHeader('Blue Heron Bridge', 'dive windows', `Inshore · LKWF1 · ${bhbMeta}`)}
<div style="border:1px solid ${C.RULE};background:${C.PAPER2};display:grid;grid-template-columns:repeat(4,1fr);margin-bottom:14px;">${tideCells}</div>
${windowCards ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);border:1px solid ${C.RULE};margin-bottom:14px;">${windowCards}</div>` : ''}
<p style="font-family:${SERIF};font-size:14.5px;line-height:1.55;color:${C.INK2};margin:0;">${json.bhbNote}</p>
</section>`

  // 9. MARINE LIFE SIGHTINGS
  const sightingItems = json.sightings.length === 0
    ? `<p style="font-family:${SERIF};font-size:15px;font-style:italic;color:${C.INK3};margin:0;">No operator reports available for today.</p>`
    : json.sightings.map((s, i) => {
        const stats = [
          s.vis   ? `<span><b style="color:${C.INK};">${s.vis}</b> vis</span>` : '',
          s.water ? `<span><b style="color:${C.INK};">${s.water}</b> water</span>` : '',
        ].filter(Boolean).join('')
        return `<div style="display:grid;grid-template-columns:110px 1fr;gap:16px;padding-bottom:14px;border-bottom:1px solid ${C.RULE};${i > 0 ? `padding-top:14px;` : ''}">
<div><span style="font-family:${SERIF};font-size:15px;font-weight:500;color:${C.INK};">${s.operator}</span><small style="display:block;font-family:${MONO};font-size:9.5px;color:${C.INK4};letter-spacing:0.08em;text-transform:uppercase;margin-top:4px;">${s.location}</small></div>
<div><q style="display:block;font-family:${SERIF};font-style:italic;font-size:15.5px;color:${C.INK};padding-left:14px;border-left:2px solid ${C.ACCENT};line-height:1.45;margin-top:0;">${s.quote}</q>
${stats ? `<div style="display:flex;gap:18px;margin-top:8px;font-family:${MONO};font-size:11px;color:${C.INK3};letter-spacing:0.06em;flex-wrap:wrap;">${stats}</div>` : ''}
</div></div>`
      }).join('')

  const sightingsSection = `<section style="padding:28px;border-top:1px solid ${C.RULE};">
${sectionHeader('Yesterday', 'underwater', `${json.sightings.length} operator reports · ${etShort}`)}
<div>${sightingItems}</div>
</section>`

  // 10. WEEK OUTLOOK
  const outlookCells = json.weekOutlook.slice(0, 5).map((w, i) => {
    const d = new Date(now)
    d.setDate(d.getDate() + i)
    const wColor = w.verdict === 'good' ? C.GOOD : w.verdict === 'choppy' ? C.WARN : C.DANGER
    return `<div style="padding:14px 12px;${i < 4 ? `border-right:1px solid ${C.RULE};` : ''}${i === 0 ? `background:${C.PAPER2};` : ''}">
<div style="font-family:${MONO};font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${C.INK3};margin-bottom:2px;">${DOW[d.getDay()]}</div>
<div style="font-family:${SERIF};font-size:20px;font-weight:500;color:${C.INK};letter-spacing:-0.01em;line-height:1;">${d.getDate()}</div>
<div style="font-weight:600;font-size:11.5px;margin-top:10px;color:${wColor};">${w.verdictLabel}</div>
<div style="font-size:11.5px;color:${C.INK3};margin-top:4px;line-height:1.4;">${w.note}</div>
</div>`
  }).join('')

  const endDate = new Date(now); endDate.setDate(endDate.getDate() + 4)
  const weekOutlookSection = `<section style="padding:28px;border-top:1px solid ${C.RULE};">
${sectionHeader('The week', 'ahead', `Wind kt · ${now.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' })}–${endDate.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' })}`)}
<div style="display:grid;grid-template-columns:repeat(5,1fr);border:1px solid ${C.RULE};">${outlookCells}</div>
<p style="font-family:${MONO};font-size:10px;color:${C.INK3};letter-spacing:0.1em;text-transform:uppercase;margin:12px 0 0;">Offshore heights from buoys 20-60nm. Nearshore varies. Check with your operator.</p>
</section>`

  // 11. SAFETY TIP
  const safetyTip = `<div style="padding:24px 28px;background:${C.PAPER2};border-top:1px solid ${C.RULE};border-bottom:1px solid ${C.RULE};">
<h3 style="font-family:${SERIF};font-weight:500;font-size:22px;letter-spacing:-0.01em;margin:0 0 10px;color:${C.DANGER};">⚠ ${json.safety.title}</h3>
<p style="font-family:${SERIF};font-size:15.5px;color:${C.INK};margin:0;line-height:1.55;">${json.safety.body}</p>
</div>`

  // 12. SUN & UV
  const uvColor = uv.uvIndex >= 8 ? C.DANGER : uv.uvIndex >= 6 ? C.WARN : C.GOOD
  const uvLabel = uv.uvIndex >= 8 ? 'Very High' : uv.uvIndex >= 6 ? 'High' : uv.uvIndex >= 3 ? 'Moderate' : 'Low'
  const uvNote  = uv.uvIndex >= 8 ? 'SPF 50+, seek shade 10am–4pm' : uv.uvIndex >= 6 ? 'SPF 30+, limit midday exposure' : uv.uvIndex >= 3 ? 'SPF 15+ recommended' : 'Minimal protection needed'

  const sunUv = `<section style="padding:28px;border-top:1px solid ${C.RULE};">
${sectionHeader('Sun &', 'UV', `${weekday} · Palm Beach`)}
<div style="display:grid;grid-template-columns:repeat(5,1fr);border:1px solid ${C.RULE};">
${gridCell('SUNRISE', fmtET(sunrise))}
${gridCell('AM GOLDEN', `${fmtET(sunrise)}–${fmtET(goldenMorningEnd)}`)}
${gridCell('PM GOLDEN', `${fmtET(goldenEveningStart)}–${fmtET(sunset)}`)}
${gridCell('SUNSET', fmtET(sunset))}
<div style="padding:14px 12px;">
<div style="font-family:${MONO};font-size:9.5px;letter-spacing:0.12em;text-transform:uppercase;color:${C.INK3};margin-bottom:6px;">UV INDEX</div>
<div style="font-family:${SERIF};font-size:28px;font-weight:500;color:${uvColor};letter-spacing:-0.005em;">${uv.uvIndex}</div>
<small style="font-family:${SANS};font-size:11px;font-weight:500;color:${C.INK3};display:block;margin-top:2px;">${uvLabel} · ${uvNote}</small>
</div>
</div>
</section>`

  // 13. POLL
  const pollLetters = ['A','B','C','D'] as const
  const pollOptions = json.poll.options.map((opt, i) =>
    `<a href="mailto:fronczakantoni2@gmail.com?subject=Poll:${encodeURIComponent(opt)}" style="display:flex;align-items:center;padding:11px 14px;border:1px solid ${C.RULE2};font-family:${SANS};font-size:13.5px;color:${C.INK};text-decoration:none;"><span style="font-family:${MONO};font-size:11px;font-weight:500;color:${C.INK3};margin-right:14px;border:1px solid ${C.RULE};padding:2px 6px;border-radius:2px;min-width:22px;text-align:center;">${pollLetters[i]}</span>${opt}</a>`
  ).join('')

  const poll = `<section style="padding:28px;border-top:1px solid ${C.RULE};">
${sectionHeader('Weekly', 'poll', 'Reply · we read every one')}
<div style="border:1px solid ${C.RULE};padding:20px;">
<div style="font-family:${SERIF};font-size:20px;font-weight:400;letter-spacing:-0.01em;color:${C.INK};margin:6px 0 14px;">${json.poll.question}</div>
<div style="display:flex;flex-direction:column;gap:6px;">${pollOptions}</div>
<div style="font-family:${MONO};font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:${C.INK3};margin-top:12px;">Tap to reply. We read every response.</div>
</div>
</section>`

  // 14. FOOTER
  const footer = `<footer style="padding:28px;border-top:2px solid ${C.INK};background:${C.PAPER};">
<p style="font-family:${SERIF};font-style:italic;font-size:16px;color:${C.INK2};text-align:center;padding:14px 0;border-top:1px solid ${C.RULE};border-bottom:1px solid ${C.RULE};margin:0 0 22px;">Know someone on the water? Forward this to a diver, angler, or anyone Space Coast to Keys. Free every morning.</p>
<p style="font-size:11px;color:${C.INK3};line-height:1.6;margin:0 0 18px;font-family:${SANS};">Sources: NDBC buoys 41009 (Space Coast, 20nm), 41114 (Treasure Coast, 6.5nm), LKWF1 (BHB inshore), 41122 (Deerfield-Miami, 23nm), SMKF1 (Marathon, 1nm), 42095 (Key West, 15nm). Upper Keys: MLRF1 decommissioned Feb 2023, no replacement. NWS zones AMZ650/670. BHB windows from iDiveFlorida. UV from Open-Meteo. Offshore buoy readings differ from nearshore — confirm with your captain.</p>
<p style="font-family:${MONO};font-size:10px;letter-spacing:0.06em;color:${C.INK4};line-height:1.7;margin:0;text-transform:uppercase;">The Florida Flow aggregates NOAA, NWS, and Open-Meteo data for informational purposes. Forecasts are predictions, not guarantees. Confirm all conditions with your operator before heading out. Use at your own risk.</p>
<div style="display:flex;justify-content:space-between;margin-top:20px;font-family:${MONO};font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:${C.INK3};">
<span>thefloridaflow.com</span><span>Issue #${issueNumber} · ${etShort}</span>
</div>
</footer>`

  const raw = `<div style="max-width:720px;margin:0 auto;background:${C.PAPER};border:1px solid ${C.RULE};font-family:${SANS};color:${C.INK};">${masthead}${verdictStrip}${alertHtml}${ledeSection}${regionalTable}${activityPlanner}${beachReport}${bhbSection}${sightingsSection}${weekOutlookSection}${safetyTip}${sunUv}${poll}${footer}</div>`
  return raw.replace(/>\s+</g, '><').trim()
}
