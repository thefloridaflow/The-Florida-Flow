import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
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

async function syncToGhost(email: string) {
  const ghostKey = process.env.GHOST_ADMIN_API_KEY
  if (!ghostKey) { console.error('GHOST_ADMIN_API_KEY not set'); return }
  try {
    const token = ghostAdminJwt(ghostKey)
    const res = await fetch('https://newsletter.thefloridaflow.com/ghost/api/admin/members/', {
      method: 'POST',
      headers: { Authorization: `Ghost ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ members: [{ email, subscribed: true }] }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok && res.status !== 422 && res.status !== 409) {
      console.error('Ghost sync error:', res.status, await res.text())
    }
  } catch (err) {
    console.error('Ghost sync threw:', err)
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
      // '23505' = duplicate, treat as success
      console.error('Supabase insert error:', error.message)
      return NextResponse.json({ error: 'Subscribe failed' }, { status: 500 })
    }

    // Sync to Ghost after response — non-blocking, won't affect user-facing result
    after(syncToGhost(normalized))

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Subscribe route error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
