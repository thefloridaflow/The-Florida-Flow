export type BuoyData = {
  stationId: string
  name: string
  region: string
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

export type UVData = {
  uvIndex: number
  uvAlert: boolean
  date: string
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

const BUOY_STATIONS: Record<string, { name: string; region: string }> = {
  '41009': { name: 'Canaveral', region: 'East of Cape Canaveral, FL' },
  '41046': { name: 'East Bahamas', region: 'Bahamas' },
  '41114': { name: 'Fort Pierce', region: 'Treasure Coast' },
  '41122': { name: 'Fort Lauderdale', region: 'Fort Lauderdale Offshore' },
  'LKWF1': { name: 'Lake Worth', region: 'Lake Worth Inshore' },
  'SMKF1': { name: 'Sombrero Key', region: 'Florida Keys' },
  'SPGF1': { name: 'Settlement Point', region: 'Grand Bahama' },
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

export async function fetchBuoyData(stationId: string): Promise<BuoyData> {
  const info = BUOY_STATIONS[stationId]
  try {
    const url = `https://www.ndbc.noaa.gov/data/realtime2/${stationId}.txt`
    const res = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(15000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    const lines = text.trim().split('\n')
    // Line 0: header, Line 1: units, Line 2+: data (newest first)
    const dataLine = lines[2]
    if (!dataLine) throw new Error('No data')
    const parts = dataLine.trim().split(/\s+/)
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
  try {
    const url = 'https://data.epa.gov/dmapservice/getEnvirofactsUVDAILY/ZIP/33401/JSON'
    const res = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(15000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    const record = json[0]
    if (!record) throw new Error('No UV data')
    return {
      uvIndex: parseInt(record.UV_INDEX, 10),
      uvAlert: record.UV_ALERT === '1',
      date: record.DATE,
    }
  } catch (err) {
    return {
      uvIndex: 0,
      uvAlert: false,
      date: '',
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
    // Trim to a readable section
    const trimmed = rawText.replace(/\r/g, '').split('\n\n').slice(1, 5).join('\n\n').trim()

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
