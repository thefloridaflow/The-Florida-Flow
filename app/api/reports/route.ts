import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export async function GET() {
  const db = getSupabase()
  const { data, error } = await db
    .from('community_reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, dive_site, visibility_ft, current_strength, notes } = body

  if (!name || !dive_site || visibility_ft == null || !current_strength) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const validCurrentStrengths = ['None', 'Light', 'Moderate', 'Strong']
  if (!validCurrentStrengths.includes(current_strength)) {
    return NextResponse.json({ error: 'Invalid current_strength' }, { status: 400 })
  }

  const visNum = Number(visibility_ft)
  if (isNaN(visNum) || visNum < 0 || visNum > 200) {
    return NextResponse.json({ error: 'Invalid visibility_ft' }, { status: 400 })
  }

  const sanitized = {
    name: String(name).slice(0, 100),
    dive_site: String(dive_site).slice(0, 150),
    visibility_ft: visNum,
    current_strength,
    notes: notes ? String(notes).slice(0, 500) : '',
  }

  const db = getSupabase()
  const { data, error } = await db
    .from('community_reports')
    .insert(sanitized)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
