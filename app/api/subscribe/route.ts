import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email || !EMAIL_RE.test(String(email))) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }
    const normalized = String(email).toLowerCase().slice(0, 254)

    // Save to Supabase (best-effort — duplicate is fine)
    try {
      const db = getSupabase()
      const { error } = await db.from('email_subscribers').insert({ email: normalized })
      if (error && error.code !== '23505') console.error('Supabase insert error:', error.message)
    } catch (dbErr) {
      console.error('Supabase error:', dbErr)
    }

    // Add to Ghost via server-side call (avoids browser CORS restriction)
    const ghostRes = await fetch('https://newsletter.thefloridaflow.com/members/api/send-magic-link/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalized, emailType: 'subscribe', labels: [] }),
      signal: AbortSignal.timeout(10000),
    })
    if (!ghostRes.ok && ghostRes.status !== 201) {
      const body = await ghostRes.text()
      console.error('Ghost subscribe error:', ghostRes.status, body)
      return NextResponse.json({ error: 'Subscribe failed' }, { status: 502 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Subscribe route error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
