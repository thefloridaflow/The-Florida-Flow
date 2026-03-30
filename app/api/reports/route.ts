import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export async function GET() {
  try {
    const db = getSupabase()
    const { data, error } = await db
      .from('community_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    const status = msg.includes('Missing Supabase') ? 503 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = getSupabase()
    const body = await req.json()
    const { name, dive_site, visibility_ft, visibility_ft_max, current_strength, notes } = body

    if (!name || !dive_site || visibility_ft == null || !current_strength) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const validCurrentStrengths = ['None', 'Light', 'Moderate', 'Strong']
    if (!validCurrentStrengths.includes(current_strength)) {
      return NextResponse.json({ error: 'Invalid current_strength' }, { status: 400 })
    }

    const visLow = Number(visibility_ft)
    if (isNaN(visLow) || visLow < 0 || visLow > 200) {
      return NextResponse.json({ error: 'Invalid visibility_ft' }, { status: 400 })
    }

    let visHigh: number | null = null
    if (visibility_ft_max != null && visibility_ft_max !== '') {
      visHigh = Number(visibility_ft_max)
      if (isNaN(visHigh) || visHigh < visLow || visHigh > 200) {
        return NextResponse.json({ error: 'Invalid visibility_ft_max' }, { status: 400 })
      }
    }

    const sanitized = {
      name: String(name).slice(0, 100),
      dive_site: String(dive_site).slice(0, 150),
      visibility_ft: visLow,
      visibility_ft_max: visHigh,
      current_strength,
      notes: notes ? String(notes).slice(0, 500) : '',
    }

    const { data, error } = await db
      .from('community_reports')
      .insert(sanitized)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    const status = msg.includes('Missing Supabase') ? 503 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
