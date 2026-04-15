export type BuoyData = {
  stationId: string
  name: string
  region: string
  lat: number
  lon: number
  offshoreNm: number
  waveHeight: string | null    // feet
  wavePeriod: string | null    // seconds
  waterTemp: string | null     // °F
  windSpeed: string | null     // knots
  windDir: string | null
  updated: string
  error?: string
}

export type TidePrediction = {
  time: string
  type: 'H' | 'L'
  height: string
}

export type TideData = {
  station: string
  predictions: TidePrediction[]
  error?: string
}

export type MarineForecast = {
  zone: string
  name: string
  forecast: string
  updated: string
  error?: string
}

export type UVHourly = { hour: string; value: number }

export type UVData = {
  uvIndex: number        // today's peak
  uvIndexTomorrow: number // tomorrow's peak
  uvAlert: boolean
  date: string
  hourly: UVHourly[]
  precip24hMm: number    // total precipitation in last 24h (mm)
  error?: string
}

export type CurrentData = {
  station: string
  name: string
  speed: string   // knots
  direction: string  // compass
  updated: string
  error?: string
}

const BUOY_STATIONS: Record<string, { name: string; region: string; lat: number; lon: number; offshoreNm: number }> = {
  '41009': { name: 'Canaveral',      region: 'East of Cape Canaveral, FL',  lat: 28.501, lon: -80.534, offshoreNm: 20 },
  '41046': { name: 'East Bahamas',   region: 'Bahamas',                     lat: 23.823, lon: -68.373, offshoreNm: 0  },
  '41114': { name: 'Fort Pierce',    region: 'Treasure Coast',              lat: 27.551, lon: -80.225, offshoreNm: 6.5 },
  '41122': { name: 'Fort Lauderdale', region: 'Fort Lauderdale Offshore',   lat: 26.044, lon: -79.097, offshoreNm: 23 },
  'LKWF1': { name: 'Lake Worth',     region: 'Lake Worth Inshore',          lat: 26.613, lon: -80.034, offshoreNm: 0  },
  'SMKF1': { name: 'Sombrero Key',   region: 'Middle Keys / Marathon',      lat: 24.627, lon: -81.113, offshoreNm: 1  },
  '42095': { name: 'Satan Shoal',    region: 'Key West / Lower Keys',       lat: 24.407, lon: -81.968, offshoreNm: 15 },
  'SANF1': { name: 'Sand Key',       region: 'Key West Inshore',            lat: 24.454, lon: -81.878, offshoreNm: 0  },
}

function metersToFeet(m: string | number): string {
  return (Number(m) * 3.28084).toFixed(1)
}

function celsiusToFahrenheit(c: string | number): string {
  return ((Number(c) * 9) / 5 + 32).toFixed(1)
}

function msToKnots(ms: string | number): string {
  return (Number(ms) * 1.94384).toFixed(1)
}

function degreesToCompass(deg: string | number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  return dirs[Math.round(Number(deg) / 22.5) % 16]
}

function scoreRow(parts: string[]): number {
  let s = 0
  if (parts.length > 6  && parts[6]  !== 'MM') s += 2  // wind speed
  if (parts.length > 8  && parts[8]  !== 'MM') s += 3  // wave height (most important)
  if (parts.length > 9  && parts[9]  !== 'MM') s += 2  // wave period
  if (parts.length > 14 && parts[14] !== 'MM') s += 1  // water temp
  return s
}

export async function fetchBuoyData(stationId: string): Promise<BuoyData> {
  const info = BUOY_STATIONS[stationId]
  try {
    const url = `https://www.ndbc.noaa.gov/data/realtime2/${stationId}.txt`
    const res = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(15000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    const lines = text.trim().split('\n')
    // Line 0: header, Line 1: units, Line 2+: data (newest first)
    if (!lines[2]) throw new Error('No data')
    // Pick the most-complete row among the last ~5 observations
    let bestParts = lines[2].trim().split(/\s+/)
    let bestScore = scoreRow(bestParts)
    for (let i = 3; i <= Math.min(6, lines.length - 1); i++) {
      const p = lines[i].trim().split(/\s+/)
      const s = scoreRow(p)
      if (s > bestScore) { bestScore = s; bestParts = p }
    }
    const parts = bestParts
    // Columns: YY MM DD hh mm WDIR WSPD GST WVHT DPD APD MWD PRES ATMP WTMP DEWP VIS PTDY TIDE
    const wdir = parts[5] !== 'MM' ? degreesToCompass(parts[5]) : null
    const wspd = parts[6] !== 'MM' ? msToKnots(parts[6]) : null
    const wvht = parts[8] !== 'MM' ? metersToFeet(parts[8]) : null
    const dpd  = parts[9] !== 'MM' ? parts[9] : null
    const wtmp = parts[14] !== 'MM' ? celsiusToFahrenheit(parts[14]) : null
    const updated = new Date(Date.UTC(
      2000 + parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]),
      parseInt(parts[3]), parseInt(parts[4]),
    )).toISOString()
    return {
      stationId,
      name: info.name,
      region: info.region,
      lat: info.lat,
      lon: info.lon,
      offshoreNm: info.offshoreNm,
      waveHeight: wvht,
      wavePeriod: dpd,
      waterTemp: wtmp,
      windSpeed: wspd,
      windDir: wdir,
      updated,
    }
  } catch (err) {
    return {
      stationId,
      name: info?.name ?? stationId,
      region: info?.region ?? '',
      lat: info?.lat ?? 0,
      lon: info?.lon ?? 0,
      offshoreNm: info?.offshoreNm ?? 0,
      waveHeight: null,
      wavePeriod: null,
      waterTemp: null,
      windSpeed: null,
      windDir: null,
      updated: 'Unavailable',
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

export async function fetchAllBuoys(): Promise<BuoyData[]> {
  return Promise.all(Object.keys(BUOY_STATIONS).map(fetchBuoyData))
}

export async function fetchTides(): Promise<TideData> {
  const stationId = '8722588'
  try {
    const today = new Date()
    const yyyy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    const beginDate = `${yyyy}${mm}${dd}`
    // fetch 2 days of predictions
    const endDate = new Date(today)
    endDate.setDate(endDate.getDate() + 1)
    const ey = endDate.getFullYear()
    const em = String(endDate.getMonth() + 1).padStart(2, '0')
    const ed = String(endDate.getDate()).padStart(2, '0')
    const endDateStr = `${ey}${em}${ed}`
    const url = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?begin_date=${beginDate}&end_date=${endDateStr}&station=${stationId}&product=predictions&datum=MLLW&time_zone=lst_ldt&interval=hilo&units=english&application=florida_flow&format=json`
    const res = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(15000) })
    const json = await res.json()
    if (json.error) throw new Error(json.error.message)
    const predictions: TidePrediction[] = (json.predictions ?? []).map((p: { t: string; type: string; v: string }) => ({
      time: p.t,
      type: p.type as 'H' | 'L',
      height: parseFloat(p.v).toFixed(2),
    }))
    return { station: stationId, predictions }
  } catch (err) {
    return {
      station: stationId,
      predictions: [],
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

export async function fetchUVIndex(): Promise<UVData> {
  // Open-Meteo — free, no key, matches forecast apps. Palm Beach, FL.
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    '?latitude=26.713&longitude=-80.057' +
    '&daily=uv_index_max' +
    '&hourly=uv_index,precipitation' +
    '&timezone=America%2FNew_York' +
    '&past_days=1' +
    '&forecast_days=2'
  try {
    const res = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(15000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()

    const todayPeak    = Math.round(json.daily.uv_index_max[1] ?? 0)  // index 1 = today (past_days=1 shifts array)
    const tomorrowPeak = Math.round(json.daily.uv_index_max[2] ?? 0)
    const todayDate    = json.daily.time[1] as string  // "2026-04-02"

    // Hourly for today only, non-zero hours
    const hourly: UVHourly[] = (json.hourly.time as string[])
      .map((t: string, i: number) => ({ t, value: Math.round(json.hourly.uv_index[i]) }))
      .filter(({ t, value }) => t.startsWith(todayDate) && value > 0)
      .map(({ t, value }) => {
        const h = parseInt(t.split('T')[1].split(':')[0], 10)
        const ampm = h >= 12 ? 'pm' : 'am'
        const disp = h % 12 || 12
        return { hour: `${disp}${ampm}`, value }
      })

    // Sum precipitation over the last 24 hours (yesterday + today so far)
    const nowHour = new Date().toISOString().slice(0, 13)
    const cutoff  = new Date(Date.now() - 86400000).toISOString().slice(0, 13)
    const precip24hMm = (json.hourly.time as string[])
      .reduce((sum: number, t: string, i: number) => {
        const h = t.slice(0, 13)
        return (h >= cutoff && h <= nowHour) ? sum + (json.hourly.precipitation[i] ?? 0) : sum
      }, 0)

    return {
      uvIndex: todayPeak,
      uvIndexTomorrow: tomorrowPeak,
      uvAlert: todayPeak >= 8,
      date: todayDate,
      hourly,
      precip24hMm,
    }
  } catch (err) {
    return {
      uvIndex: 0,
      uvIndexTomorrow: 0,
      uvAlert: false,
      date: '',
      hourly: [],
      precip24hMm: 0,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

export type DayOutlook = {
  date: string       // "2026-04-07"
  label: string      // "Tue Apr 8"
  summary: string    // WMO description
  windMaxKt: number
  windGustMaxKt: number
  precipMm: number
  precipProbMax: number
}

export type WeatherOutlook = {
  daily: DayOutlook[]
  tonightHourly: Array<{ time: string; windKt: number; windGustKt: number; precipProb: number }>
  error?: string
}

function wmoDescription(code: number): string {
  if (code === 0)           return 'Clear'
  if (code <= 3)            return 'Partly cloudy'
  if (code <= 49)           return 'Fog/mist'
  if (code <= 59)           return 'Drizzle'
  if (code <= 67)           return 'Rain'
  if (code <= 77)           return 'Snow/sleet'
  if (code <= 82)           return 'Rain showers'
  if (code <= 84)           return 'Heavy showers'
  if (code <= 99)           return 'Thunderstorms'
  return 'Unknown'
}

export async function fetchWeatherOutlook(): Promise<WeatherOutlook> {
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    '?latitude=26.713&longitude=-80.057' +
    '&daily=weather_code,wind_speed_10m_max,wind_gusts_10m_max,precipitation_sum,precipitation_probability_max' +
    '&hourly=wind_speed_10m,wind_gusts_10m,precipitation_probability,weather_code' +
    '&wind_speed_unit=kn' +
    '&timezone=America%2FNew_York' +
    '&forecast_days=7'
  try {
    const res = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(15000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()

    const daily: DayOutlook[] = (json.daily.time as string[]).map((date: string, i: number) => {
      const d = new Date(date + 'T12:00:00-04:00')
      const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' })
      return {
        date,
        label,
        summary: wmoDescription(json.daily.weather_code[i]),
        windMaxKt:     Math.round(json.daily.wind_speed_10m_max[i]   ?? 0),
        windGustMaxKt: Math.round(json.daily.wind_gusts_10m_max[i]   ?? 0),
        precipMm:      parseFloat((json.daily.precipitation_sum[i]    ?? 0).toFixed(1)),
        precipProbMax: json.daily.precipitation_probability_max[i]   ?? 0,
      }
    })

    // Tonight = today's hours 18-23 ET
    const todayDate = json.daily.time[0] as string
    const tonightHourly = (json.hourly.time as string[])
      .map((t: string, i: number) => ({ t, i }))
      .filter(({ t }) => {
        const h = parseInt(t.split('T')[1].split(':')[0], 10)
        return t.startsWith(todayDate) && h >= 18
      })
      .map(({ t, i }) => ({
        time: t.split('T')[1].slice(0, 5),
        windKt:      Math.round(json.hourly.wind_speed_10m[i]     ?? 0),
        windGustKt:  Math.round(json.hourly.wind_gusts_10m[i]     ?? 0),
        precipProb:  json.hourly.precipitation_probability[i]     ?? 0,
      }))

    return { daily, tonightHourly }
  } catch (err) {
    return {
      daily: [],
      tonightHourly: [],
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

export async function fetchCurrents(): Promise<CurrentData> {
  // NOAA CO-OPS PORTS station pe0101 — Port Everglades, Fort Lauderdale
  try {
    const url = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?station=pe0101&product=currents&date=latest&units=english&time_zone=lst_ldt&format=json'
    const res = await fetch(url, { next: { revalidate: 600 }, signal: AbortSignal.timeout(15000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    if (json.error) throw new Error(json.error.message)
    const d = json.data?.[0]
    if (!d) throw new Error('No current data')
    return {
      station: 'pe0101',
      name: 'Port Everglades',
      speed: parseFloat(d.s).toFixed(2),
      direction: degreesToCompass(d.d),
      updated: d.t,
    }
  } catch (err) {
    return {
      station: 'pe0101',
      name: 'Port Everglades',
      speed: '',
      direction: '',
      updated: '',
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

export async function fetchMarineForecast(): Promise<MarineForecast> {
  // CWF = Coastal Waters Forecast (issued daily by NWS Miami)
  // SMW = Special Marine Warning (issued as needed — fetched separately from alerts API)
  try {
    // 1. Check for active Special Marine Warnings
    let warningText = ''
    try {
      const alertsRes = await fetch(
        'https://api.weather.gov/alerts/active?area=FL&event=Special%20Marine%20Warning',
        {
          headers: { 'User-Agent': 'FloridaFlowApp/1.0' },
          next: { revalidate: 300 },
          signal: AbortSignal.timeout(10000),
        }
      )
      if (alertsRes.ok) {
        const alertsJson = await alertsRes.json()
        const features: Array<{ properties: { event: string; expires: string; description: string; headline?: string } }> = alertsJson.features ?? []
        if (features.length > 0) {
          warningText = features.map(f =>
            `⚠️ ACTIVE ${f.properties.event} — Expires: ${f.properties.expires}\n${f.properties.headline ?? ''}\n${f.properties.description}`
          ).join('\n\n') + '\n\n'
        }
      }
    } catch {
      // non-fatal — proceed without warning text
    }

    // 2. Fetch latest Coastal Waters Forecast (CWF) — issued multiple times daily
    const productUrl = 'https://api.weather.gov/products/types/CWF/locations/MFL'
    const prodRes = await fetch(productUrl, {
      headers: { 'User-Agent': 'FloridaFlowApp/1.0' },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(15000),
    })
    if (!prodRes.ok) throw new Error(`Product HTTP ${prodRes.status}`)
    const prodJson = await prodRes.json()
    const latestId = prodJson['@graph']?.[0]?.['@id']
    if (!latestId) throw new Error('No CWF product found')

    const textRes = await fetch(latestId, {
      headers: { 'User-Agent': 'FloridaFlowApp/1.0' },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(15000),
    })
    if (!textRes.ok) throw new Error(`Text HTTP ${textRes.status}`)
    const textJson = await textRes.json()
    const rawText: string = textJson.productText ?? ''
    // Strip NWS product headers; find first weather section.
    // CWF uses single-dot headers like ".Synopsis", MWS uses "...HAZARD..." style.
    const paras = rawText.replace(/\r/g, '').split('\n\n')
    const contentIdx = paras.findIndex(p => /^\s*\.[A-Z.]/.test(p) && p.trim().length > 5)
    const trimmed = contentIdx >= 0
      ? paras
          .slice(contentIdx)
          .filter(p => !/^\s*\$\$/.test(p) && p.trim().length > 0)
          .slice(0, 8)
          .join('\n\n')
          .trim()
      : paras.filter(p => p.trim().length > 3).slice(2, 8).join('\n\n').trim()

    return {
      zone: 'AMZ630',
      name: 'South Florida Waters',
      forecast: warningText + (trimmed || rawText.slice(0, 800)),
      updated: textJson.issuanceTime ?? new Date().toISOString(),
    }
  } catch (err) {
    return {
      zone: 'AMZ630',
      name: 'South Florida Waters',
      forecast: '',
      updated: '',
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}
