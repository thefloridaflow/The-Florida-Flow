import { NextResponse } from 'next/server'
import { fetchTides } from '@/lib/noaa'

export const revalidate = 3600

export async function GET() {
  const data = await fetchTides()
  return NextResponse.json(data)
}
