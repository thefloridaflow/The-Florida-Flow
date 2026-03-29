import { NextRequest, NextResponse } from 'next/server'
import { fetchAllBuoys, fetchTides, fetchMarineForecast } from '@/lib/noaa'

// This route is called by Vercel Cron every hour.
// It pre-warms the Next.js fetch cache for all data sources.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [buoys, tides, forecast] = await Promise.allSettled([
    fetchAllBuoys(),
    fetchTides(),
    fetchMarineForecast(),
  ])

  return NextResponse.json({
    ok: true,
    buoys: buoys.status === 'fulfilled' ? 'ok' : buoys.reason,
    tides: tides.status === 'fulfilled' ? 'ok' : tides.reason,
    forecast: forecast.status === 'fulfilled' ? 'ok' : forecast.reason,
    timestamp: new Date().toISOString(),
  })
}
