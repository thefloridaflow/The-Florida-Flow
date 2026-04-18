import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'

const GHOST_BASE = 'https://newsletter.thefloridaflow.com'
const RESEND_AUDIENCE_ID = 'ce90f469-8f63-419a-99c2-dd4208169f12'

function ghostJWT(apiKey: string): string {
  const [id, secret] = apiKey.split(':')
  const now = Math.floor(Date.now() / 1000)
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', kid: id, typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ iat: now, exp: now + 300, aud: '/admin/' })).toString('base64url')
  const sig = createHmac('sha256', Buffer.from(secret, 'hex')).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${sig}`
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ghostKey = process.env.GHOST_ADMIN_API_KEY
  const resendKey = process.env.RESEND_API_KEY
  if (!ghostKey)  return NextResponse.json({ error: 'GHOST_ADMIN_API_KEY not set' }, { status: 503 })
  if (!resendKey) return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 503 })

  const allMembers: { email: string; name: string; subscribed: boolean }[] = []
  let page = 1
  while (true) {
    const res = await fetch(
      `${GHOST_BASE}/ghost/api/admin/members/?limit=250&page=${page}`,
      { headers: { Authorization: `Ghost ${ghostJWT(ghostKey)}` }, signal: AbortSignal.timeout(15000) }
    )
    if (!res.ok) return NextResponse.json({ error: `Ghost API ${res.status}`, body: await res.text() }, { status: 500 })
    const json = await res.json()
    if (!json.members?.length) break
    allMembers.push(...json.members.map((m: { email: string; name?: string; subscribed?: boolean }) => ({
      email: m.email, name: m.name ?? '', subscribed: m.subscribed ?? true,
    })))
    if (!json.meta?.pagination?.next) break
    page++
  }

  let ok = 0, fail = 0
  const errors: string[] = []
  for (const m of allMembers) {
    const [first, ...rest] = m.name.split(' ')
    const r = await fetch(`https://api.resend.com/audiences/${RESEND_AUDIENCE_ID}/contacts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: m.email, first_name: first ?? '', last_name: rest.join(' '), unsubscribed: !m.subscribed }),
    })
    if (r.ok) { ok++ } else { fail++; errors.push(`${m.email}: ${(await r.text()).slice(0, 80)}`) }
  }

  return NextResponse.json({ total: allMembers.length, upserted: ok, failed: fail, errors: errors.slice(0, 10) })
}
