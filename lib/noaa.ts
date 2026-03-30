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
  uvIndex: number
  uvAlert: boolean
  date: string
  hourly: UVHourly[]
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
  '41114': { name: 'Fort Pierce',    region: 'Treasure Coast',              lat: 27.551, lon: -80.225, offshoreNm: 12 },
  '41122': { name: 'Fort Lauderdale', region: 'Fort Lauderdale Offshore',   lat: 26.044, lon: -79.097, offshoreNm: 23 },
  'LKWF1': { name: 'Lake Worth',     region: 'Lake Worth Inshore',          lat: 26.613, lon: -80.034, offshoreNm: 0  },
  'SMKF1': { name: 'Sombrero Key',   region: 'Florida Keys',                lat: 24.627, lon: -81.113, offshoreNm: 1  },
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
  // EPA Envirofacts UV forecast for West Palm Beach, FL (ZIP 33401)
  const opts = { next: { revalidate: 3600 }, signal: AbortSignal.timeout(15000) }
  try {
    const [dailyRes, hourlyRes] = await Promise.all([
      fetch('https://data.epa.gov/dmapservice/getEnvirofactsUVDAILY/ZIP/33401/JSON', opts),
      fetch('https://data.epa.gov/dmapservice/getEnvirofactsUVHOURLY/ZIP/33401/JSON', opts),
    ])
    if (!dailyRes.ok) throw new Error(`HTTP ${dailyRes.status}`)
    const dailyJson = await dailyRes.json()
    const record = dailyJson[0]
    if (!record) throw new Error('No UV data')

    let hourly: UVHourly[] = []
    if (hourlyRes.ok) {
      const hourlyJson: Array<{ DATE_TIME: string; UV_VALUE: number }> = await hourlyRes.json()
      hourly = hourlyJson
        .filter(h => h.DATE_TIME.startsWith(record.DATE))
        .map(h => {
          const parts = h.DATE_TIME.split(' ')          // ["Mar/30/2026", "07", "AM"]
          const hour = parseInt(parts[1], 10).toString() // "7"
          return { hour: `${hour}${parts[2][0].toLowerCase()}`, value: h.UV_VALUE }
        })
    }

    return {
      uvIndex: parseInt(record.UV_INDEX, 10),
      uvAlert: record.UV_ALERT === '1',
      date: record.DATE,
      hourly,
    }
  } catch (err) {
    return {
      uvIndex: 0,
      uvAlert: false,
      date: '',
      hourly: [],
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
  // NWS Marine Zone AMZ630 = Waters from Jupiter Inlet to Deerfield Beach FL out 20 to 60 NM
  // We try the NWS API for the Miami marine zone
  try {
    const zoneUrl = 'https://api.weather.gov/zones/forecast/AMZ630'
    const zoneRes = await fetch(zoneUrl, {
      headers: { 'User-Agent': 'FloridaFlowApp/1.0' },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(15000),
    })
    if (!zoneRes.ok) throw new Error(`Zone HTTP ${zoneRes.status}`)
    const zoneJson = await zoneRes.json()
    const forecastUrl = zoneJson.properties?.forecastOffice
      ? `${zoneJson.properties.forecastOffice}/forecasts/marine`
      : null

    // Use the NWS text product for South Florida waters
    const productUrl = 'https://api.weather.gov/products/types/MWS/locations/MFL'
    const prodRes = await fetch(productUrl, {
      headers: { 'User-Agent': 'FloridaFlowApp/1.0' },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(15000),
    })
    if (!prodRes.ok) throw new Error(`Product HTTP ${prodRes.status}`)
    const prodJson = await prodRes.json()
    const latestId = prodJson['@graph']?.[0]?.['@id']
    if (!latestId) throw new Error('No forecast product found')

    const textRes = await fetch(latestId, {
      headers: { 'User-Agent': 'FloridaFlowApp/1.0' },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(15000),
    })
    if (!textRes.ok) throw new Error(`Text HTTP ${textRes.status}`)
    const textJson = await textRes.json()
    const rawText: string = textJson.productText ?? ''
    // Strip NWS product headers; start from the first weather statement (lines beginning with '...')
    const paras = rawText.replace(/\r/g, '').split('\n\n')
    const contentIdx = paras.findIndex(p => /^\s*\.{3}/.test(p))
    const trimmed = contentIdx >= 0
      ? paras
          .slice(contentIdx)
          .filter(p => !/^\s*\$\$/.test(p) && p.trim().length > 0)
          .slice(0, 6)
          .join('\n\n')
          .trim()
      : paras.filter(p => p.trim().length > 3).slice(2, 6).join('\n\n').trim()

    return {
      zone: 'AMZ630',
      name: 'South Florida Waters',
      forecast: trimmed || rawText.slice(0, 800),
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
