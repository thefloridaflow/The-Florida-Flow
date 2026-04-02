import { unstable_cache } from 'next/cache'
import Anthropic from '@anthropic-ai/sdk'
import { fetchAllBuoys, fetchMarineForecast } from './noaa'
import type { BuoyData } from './noaa'

// Snap wave height to nearest 0.5 ft so minor fluctuations don't bust the cache
function snapWave(val: string | null): string {
  if (!val) return 'MM'
  return (Math.round(parseFloat(val) * 2) / 2).toFixed(1)
}

// Build a stable summary string using snapped values — this is both the cache key
// and what gets sent to Claude, so the cached text always matches what it describes.
function buildSummary(buoys: BuoyData[]): string {
  return buoys
    .filter(b => !b.error && (b.waveHeight || b.waterTemp || b.windSpeed))
    .map(b => {
      const parts: string[] = []
      if (b.waveHeight) parts.push(`seas ${snapWave(b.waveHeight)} ft`)
      if (b.wavePeriod) parts.push(`${Math.round(parseFloat(b.wavePeriod))}s period`)
      if (b.windSpeed)  parts.push(`wind ${Math.round(parseFloat(b.windSpeed))} kt ${b.windDir ?? ''}`.trim())
      if (b.waterTemp)  parts.push(`water ${Math.round(parseFloat(b.waterTemp))}°F`)
      return `${b.name} (${b.region}): ${parts.join(', ')}`
    })
    .join('\n')
}

const _cachedOverview = unstable_cache(
  async (buoySummary: string, forecastExcerpt: string): Promise<string> => {
    const key = process.env.ANTHROPIC_API_KEY
    if (!key) return ''
    const client = new Anthropic({ apiKey: key })
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 160,
      messages: [{
        role: 'user',
        content: `Write one tight paragraph (2-3 sentences, under 75 words) summarizing current South Florida ocean conditions from the Space Coast to Key West. Knowledgeable local voice. Data only, no judgment calls. No em dashes. Do not open with "Conditions are" or "Water temps are." Use specific numbers. Call out any clear contrast between regions (roughest vs calmest).

LIVE BUOY DATA:
${buoySummary}

NWS FORECAST EXCERPT:
${forecastExcerpt}

Output only the paragraph.`,
      }],
    })
    return msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
  },
  ['conditions-overview'],
  { revalidate: 1800 },
)

export async function getConditionsOverview(): Promise<string> {
  try {
    const [buoys, forecast] = await Promise.all([fetchAllBuoys(), fetchMarineForecast()])
    const buoySummary = buildSummary(buoys)
    const forecastExcerpt = (forecast.forecast ?? '').slice(0, 350)
    return await _cachedOverview(buoySummary, forecastExcerpt)
  } catch {
    return ''
  }
}
