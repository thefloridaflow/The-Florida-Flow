import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email || !EMAIL_RE.test(String(email))) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }
    const db = getSupabase()
    const { error } = await db
      .from('email_subscribers')
      .insert({ email: String(email).toLowerCase().slice(0, 254) })
    if (error) {
      // duplicate = already subscribed
      if (error.code === '23505') return NextResponse.json({ ok: true, already: true })
      throw error
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
