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

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email || !EMAIL_RE.test(String(email))) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }
    const normalized = String(email).toLowerCase().slice(0, 254)

    // Save to Supabase (best-effort)
    try {
      const db = getSupabase()
      const { error } = await db.from('email_subscribers').insert({ email: normalized })
      if (error && error.code !== '23505') console.error('Supabase insert error:', error.message)
    } catch (dbErr) {
      console.error('Supabase error:', dbErr)
    }

    // Add to Ghost via Admin API (server-side JWT, no CORS issues)
    const ghostKey = process.env.GHOST_ADMIN_API_KEY
    if (!ghostKey) {
      console.error('GHOST_ADMIN_API_KEY not set')
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 })
    }
    const token = ghostAdminJwt(ghostKey)
    const ghostRes = await fetch('https://newsletter.thefloridaflow.com/ghost/api/admin/members/', {
      method: 'POST',
      headers: { Authorization: `Ghost ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ members: [{ email: normalized, subscribed: true }] }),
      signal: AbortSignal.timeout(10000),
    })

    if (!ghostRes.ok) {
      const body = await ghostRes.text()
      // 422 = member already exists — that's fine
      if (ghostRes.status === 422) return NextResponse.json({ ok: true, already: true })
      console.error('Ghost Admin API error:', ghostRes.status, body)
      return NextResponse.json({ error: 'Subscribe failed' }, { status: 502 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Subscribe route error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
