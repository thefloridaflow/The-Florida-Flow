import { NextResponse } from 'next/server'
import { fetchAllBuoys, fetchTides, fetchMarineForecast, fetchUVIndex, fetchCurrents } from '@/lib/noaa'

export const revalidate = 3600

// Single endpoint that aggregates all data needed for the newsletter draft.
// Used by the CCR scheduled agent to avoid direct NOAA/NWS calls from the sandbox.
export async function GET() {
  const [buoys, tides, forecast, uv, current] = await Promise.all([
    fetchAllBuoys(),
    fetchTides(),
    fetchMarineForecast(),
    fetchUVIndex(),
    fetchCurrents(),
  ])

  return NextResponse.json({ buoys, tides, forecast, uv, current })
}
