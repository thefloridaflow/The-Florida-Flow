import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const GHOST_BASE = 'https://newsletter.thefloridaflow.com'

async function sendGhostMagicLink(email: string): Promise<void> {
  // Ghost requires an integrity token (anti-CSRF) fetched first
  const tokenRes = await fetch(`${GHOST_BASE}/members/api/integrity-token/`, {
    headers: { Origin: GHOST_BASE },
    signal: AbortSignal.timeout(8000),
  })
  if (!tokenRes.ok) throw new Error(`Integrity token fetch failed: ${tokenRes.status}`)
  const integrityToken = await tokenRes.text()

  const res = await fetch(`${GHOST_BASE}/members/api/send-magic-link/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: GHOST_BASE },
    body: JSON.stringify({ email, emailType: 'subscribe', labels: [], requestSrc: 'portal', integrityToken }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Ghost magic link ${res.status}: ${body.slice(0, 200)}`)
  }
}

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
      if (error && error.code !== '23505') console.error('[subscribe] Supabase:', error.message)
    } catch (e) {
      console.error('[subscribe] Supabase threw:', e)
    }

    // Send Ghost magic link — fetches integrity token first, then triggers confirmation email
    await sendGhostMagicLink(normalized)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[subscribe] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
