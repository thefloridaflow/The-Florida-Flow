import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { getSupabase } from '@/lib/supabase'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const GHOST_BASE = 'https://newsletter.thefloridaflow.com'

// ip-api.com free tier is HTTP only; 45 req/min
async function geolocateIp(ip: string): Promise<Record<string, string> | null> {
  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,city,country,countryCode,lat,lon`,
      { signal: AbortSignal.timeout(3000) },
    )
    if (!res.ok) return null
    const data = await res.json()
    if (data.status !== 'success') return null
    return {
      city:         data.city,
      country:      data.country,
      country_code: data.countryCode,
      latitude:     String(data.lat),
      longitude:    String(data.lon),
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

async function setGhostGeolocation(email: string, geo: Record<string, string>): Promise<void> {
  const ghostKey = process.env.GHOST_ADMIN_API_KEY
  if (!ghostKey) return
  const token = ghostAdminJwt()
  const headers = { Authorization: `Ghost ${token}`, 'Content-Type': 'application/json' }

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
    body: JSON.stringify({ members: [{ geolocation: JSON.stringify(geo) }] }),
    signal: AbortSignal.timeout(5000),
  })
}

async function sendGhostMagicLink(email: string, userIp?: string): Promise<void> {
  // Ghost requires an integrity token (anti-CSRF) fetched first
  const tokenRes = await fetch(`${GHOST_BASE}/members/api/integrity-token/`, {
    headers: { Origin: GHOST_BASE },
    signal: AbortSignal.timeout(8000),
  })
  if (!tokenRes.ok) throw new Error(`Integrity token fetch failed: ${tokenRes.status}`)
  const integrityToken = await tokenRes.text()

  // Forward the user's real IP so Ghost geolocates them correctly,
  // not the Vercel server IP (which would always resolve to Virginia, US)
  const forwardHeaders: Record<string, string> = { 'Content-Type': 'application/json', Origin: GHOST_BASE }
  if (userIp) forwardHeaders['X-Forwarded-For'] = userIp

  const res = await fetch(`${GHOST_BASE}/members/api/send-magic-link/`, {
    method: 'POST',
    headers: forwardHeaders,
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

    // Geolocate and send magic link in parallel — geo doesn't block the subscribe
    const [geo] = await Promise.all([
      userIp ? geolocateIp(userIp) : Promise.resolve(null),
      sendGhostMagicLink(normalized, userIp),
    ])

    // Set Ghost geolocation field via Admin API (best-effort — member now exists)
    if (geo) {
      setGhostGeolocation(normalized, geo).catch(e =>
        console.error('[subscribe] geo update failed:', e)
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[subscribe] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
