import { NextResponse } from 'next/server'
import { fetchMarineForecast } from '@/lib/noaa'

export const revalidate = 3600

export async function GET() {
  const data = await fetchMarineForecast()
  return NextResponse.json(data)
}
