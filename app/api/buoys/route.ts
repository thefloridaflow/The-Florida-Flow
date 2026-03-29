import { NextResponse } from 'next/server'
import { fetchAllBuoys } from '@/lib/noaa'

export const revalidate = 3600 // 1 hour

export async function GET() {
  const data = await fetchAllBuoys()
  return NextResponse.json(data)
}
