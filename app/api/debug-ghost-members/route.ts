import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'

// Protected by CRON_SECRET — remove this file after debugging
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ghostKey = process.env.GHOST_ADMIN_API_KEY
  if (!ghostKey) return NextResponse.json({ error: 'GHOST_ADMIN_API_KEY not set' })

  const [id, secret] = ghostKey.split(':')
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', kid: id, typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300, aud: '/admin/' })).toString('base64url')
  const sig     = createHmac('sha256', Buffer.from(secret, 'hex')).update(`${header}.${payload}`).digest('base64url')
  const token   = `${header}.${payload}.${sig}`

  // Test 1: list members (GET)
  const listRes = await fetch('https://newsletter.thefloridaflow.com/ghost/api/admin/members/?limit=1', {
    headers: { Authorization: `Ghost ${token}` },
    signal: AbortSignal.timeout(10000),
  })
  const listBody = await listRes.text()

  // Test 2: list newsletters
  const nlRes = await fetch('https://newsletter.thefloridaflow.com/ghost/api/admin/newsletters/', {
    headers: { Authorization: `Ghost ${token}` },
    signal: AbortSignal.timeout(10000),
  })
  const nlBody = await nlRes.text()

  // Test 3: try creating a member
  const createRes = await fetch('https://newsletter.thefloridaflow.com/ghost/api/admin/members/', {
    method: 'POST',
    headers: { Authorization: `Ghost ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ members: [{ email: 'debug-test@thefloridaflow.com', name: 'Debug Test' }] }),
    signal: AbortSignal.timeout(10000),
  })
  const createBody = await createRes.text()

  return NextResponse.json({
    keyPrefix: ghostKey.slice(0, 8) + '...',
    listMembers: { status: listRes.status, body: listBody.slice(0, 500) },
    listNewsletters: { status: nlRes.status, body: nlBody.slice(0, 500) },
    createMember: { status: createRes.status, body: createBody.slice(0, 500) },
  })
}
