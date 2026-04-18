import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { getSupabase } from '@/lib/supabase'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const GHOST_BASE = 'https://newsletter.thefloridaflow.com'

async function geolocateIp(ip: string): Promise<Record<string, string> | null> {
  try {
    // HTTPS endpoint via ipapi.co — no key needed, 1000 req/day free
    const res = await fetch(
      `https://ipapi.co/${ip}/json/`,
      { signal: AbortSignal.timeout(3000) },
    )
    if (!res.ok) return null
    const data = await res.json()
    if (data.error || !data.city) return null
    return {
      city:         data.city,
      country:      data.country_name,
      country_code: data.country_code,
      latitude:     String(data.latitude),
      longitude:    String(data.longitude),
    }
  } catch {
    return null
  }
}

function ghostAdminJwt(): string {
  const ghostKey = process.env.GHOST_ADMIN_API_KEY ?? ''
  const [id, secret] = ghostKey.split(':')
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', kid: id, typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300, aud: '/admin/' })).toString('base64url')
  const sig     = createHmac('sha256', Buffer.from(secret, 'hex')).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${sig}`
}

// Create member via Admin API with geolocation pre-set, then send magic link.
// This avoids the race condition of trying to update a member that doesn't exist yet.
async function upsertGhostMemberWithGeo(email: string, geo: Record<string, string> | null): Promise<void> {
  const ghostKey = process.env.GHOST_ADMIN_API_KEY
  if (!ghostKey || !geo) return
  const token = ghostAdminJwt()
  const headers = { Authorization: `Ghost ${token}`, 'Content-Type': 'application/json' }
  const geolocation = JSON.stringify(geo)

  const post = await fetch(`${GHOST_BASE}/ghost/api/admin/members/`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ members: [{ email, geolocation }] }),
    signal: AbortSignal.timeout(5000),
  })

  if (post.status === 422) {
    // Already exists — find and update
    const search = await fetch(
      `${GHOST_BASE}/ghost/api/admin/members/?filter=email:'${encodeURIComponent(email)}'&limit=1`,
      { headers, signal: AbortSignal.timeout(5000) },
    )
    if (!search.ok) return
    const { members } = await search.json()
    if (!members?.length) return
    await fetch(`${GHOST_BASE}/ghost/api/admin/members/${members[0].id}/`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ members: [{ geolocation }] }),
      signal: AbortSignal.timeout(5000),
    })
  }
}

async function upsertResendContact(email: string): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return
  await fetch('https://api.resend.com/audiences/ce90f469-8f63-419a-99c2-dd4208169f12/contacts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, unsubscribed: false }),
    signal: AbortSignal.timeout(5000),
  })
}

async function sendGhostMagicLink(email: string): Promise<void> {
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

    const userIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? undefined

    // Geolocate first, then create member with geo pre-set, then send magic link.
    // Creating before magic link ensures geolocation is set when Ghost confirms the member.
    const geo = userIp ? await geolocateIp(userIp) : null
    await Promise.all([
      upsertGhostMemberWithGeo(normalized, geo).catch(e => console.error('[subscribe] geo upsert failed:', e)),
      sendGhostMagicLink(normalized),
      upsertResendContact(normalized).catch(e => console.error('[subscribe] Resend upsert failed:', e)),
    ])

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[subscribe] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
