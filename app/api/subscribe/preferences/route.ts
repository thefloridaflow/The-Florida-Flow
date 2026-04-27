import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

const AUDIENCE_ID = 'ce90f469-8f63-419a-99c2-dd4208169f12'

export async function POST(req: NextRequest) {
  try {
    const { email, location, interests } = await req.json()
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'email required' }, { status: 400 })
    }
    const normalized = email.toLowerCase().slice(0, 254)

    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) return NextResponse.json({ error: 'Resend not configured' }, { status: 503 })

    // Update Supabase with preferences (best-effort)
    try {
      const db = getSupabase()
      const update: Record<string, unknown> = {}
      if (location && typeof location === 'string' && location.length < 100) update.location = location
      if (Array.isArray(interests) && interests.length > 0) {
        update.interests = interests.filter((i: unknown) => typeof i === 'string' && i.length < 50)
      }
      if (Object.keys(update).length > 0) {
        const { error } = await db.from('email_subscribers').upsert({ email: normalized, ...update })
        if (error) console.error('[preferences] Supabase update failed:', error.message)
      }
    } catch (e) {
      console.error('[preferences] Supabase threw:', e)
    }

    // Ensure contact is active in Resend audience
    await fetch(`https://api.resend.com/audiences/${AUDIENCE_ID}/contacts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalized, unsubscribed: false }),
      signal: AbortSignal.timeout(5000),
    }).catch(e => console.error('[preferences] Resend upsert failed:', e))

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[preferences] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
