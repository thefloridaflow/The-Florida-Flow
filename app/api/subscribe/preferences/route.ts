import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'

const GHOST_BASE = 'https://newsletter.thefloridaflow.com'

function ghostAdminJwt(): string {
  const ghostKey = process.env.GHOST_ADMIN_API_KEY ?? ''
  const [id, secret] = ghostKey.split(':')
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', kid: id, typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300, aud: '/admin/' })).toString('base64url')
  const sig     = createHmac('sha256', Buffer.from(secret, 'hex')).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${sig}`
}

export async function POST(req: NextRequest) {
  try {
    const { email, location, interests } = await req.json()
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'email required' }, { status: 400 })
    }

    const ghostKey = process.env.GHOST_ADMIN_API_KEY
    if (!ghostKey) return NextResponse.json({ error: 'Ghost not configured' }, { status: 503 })

    const token = ghostAdminJwt()
    const headers = { Authorization: `Ghost ${token}`, 'Content-Type': 'application/json' }

    // Look up the member by email
    const search = await fetch(
      `${GHOST_BASE}/ghost/api/admin/members/?filter=email:'${encodeURIComponent(email)}'&limit=1`,
      { headers, signal: AbortSignal.timeout(8000) },
    )
    if (!search.ok) {
      console.error('[preferences] Ghost member search failed:', search.status)
      return NextResponse.json({ error: 'Ghost lookup failed' }, { status: 502 })
    }
    const { members } = await search.json()

    const labels: { name: string }[] = Array.isArray(interests)
      ? interests.filter((i: unknown) => typeof i === 'string' && i.length < 50).map((i: string) => ({ name: i }))
      : []
    const note = location && typeof location === 'string' && location.length < 100
      ? `Location: ${location}`
      : undefined

    if (members?.length > 0) {
      // Member exists — update labels and note
      const memberId: string = members[0].id
      const existing: { name: string }[] = members[0].labels ?? []
      // Merge: keep existing labels, add new ones (Ghost replaces on PUT so we need to merge)
      const existingNames = new Set(existing.map((l: { name: string }) => l.name))
      const merged = [...existing, ...labels.filter(l => !existingNames.has(l.name))]

      const body: Record<string, unknown> = { labels: merged }
      if (note) body.note = note

      const put = await fetch(`${GHOST_BASE}/ghost/api/admin/members/${memberId}/`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ members: [body] }),
        signal: AbortSignal.timeout(8000),
      })
      if (!put.ok) console.error('[preferences] Ghost PUT failed:', put.status, await put.text())
    } else {
      // Member not yet in Ghost (magic link not clicked) — create them now with labels
      // Ghost will merge when they confirm the magic link
      const body: Record<string, unknown> = { email, labels }
      if (note) body.note = note

      const post = await fetch(`${GHOST_BASE}/ghost/api/admin/members/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ members: [body] }),
        signal: AbortSignal.timeout(8000),
      })
      // 422 = already exists (race), that's fine
      if (!post.ok && post.status !== 422) {
        console.error('[preferences] Ghost POST failed:', post.status, await post.text())
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[preferences] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
