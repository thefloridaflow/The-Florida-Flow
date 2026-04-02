import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { getSupabase } from '@/lib/supabase'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function ghostAdminJwt(ghostKey: string): string {
  const [id, secret] = ghostKey.split(':')
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', kid: id, typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300, aud: '/admin/' })).toString('base64url')
  const sig     = createHmac('sha256', Buffer.from(secret, 'hex')).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${sig}`
}

async function syncToGhost(email: string): Promise<void> {
  const ghostKey = process.env.GHOST_ADMIN_API_KEY
  if (!ghostKey) { console.error('[subscribe] GHOST_ADMIN_API_KEY not set — skipping Ghost sync'); return }
  try {
    const token = ghostAdminJwt(ghostKey)
    const body = JSON.stringify({ members: [{ email, name: '' }] })
    console.log('[subscribe] POSTing to Ghost Admin members API for:', email)
    const res = await fetch('https://newsletter.thefloridaflow.com/ghost/api/admin/members/', {
      method: 'POST',
      headers: { Authorization: `Ghost ${token}`, 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(10000),
    })
    const text = await res.text()
    if (res.status === 422 || res.status === 409) {
      console.log('[subscribe] Ghost: member already exists, ok')
    } else if (!res.ok) {
      console.error('[subscribe] Ghost Admin API error:', res.status, text)
    } else {
      console.log('[subscribe] Ghost: member created ok, status', res.status)
    }
  } catch (err) {
    console.error('[subscribe] Ghost sync threw:', err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email || !EMAIL_RE.test(String(email))) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }
    const normalized = String(email).toLowerCase().slice(0, 254)

    // Save to Supabase — this is the source of truth for success/failure
    const db = getSupabase()
    const { error } = await db.from('email_subscribers').insert({ email: normalized })
    if (error && error.code !== '23505') {
      console.error('[subscribe] Supabase insert error:', error.message)
      return NextResponse.json({ error: 'Subscribe failed' }, { status: 500 })
    }

    // Sync to Ghost synchronously (awaited so it runs before function exits)
    // Ghost failure is non-fatal — user already captured in Supabase
    await syncToGhost(normalized)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[subscribe] route error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
