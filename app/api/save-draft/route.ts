import { NextResponse } from 'next/server'

// Accepts newsletter draft content from the CCR agent and commits it to GitHub.
// Requires GITHUB_TOKEN env var with contents:write on the repo.
export async function POST(req: Request) {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'GITHUB_TOKEN not configured' }, { status: 503 })
  }

  let body: { date?: string; content?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { date, content } = body
  if (!date || !content) {
    return NextResponse.json({ error: 'Missing date or content' }, { status: 400 })
  }

  // Validate date format YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
  }

  const path = `drafts/${date}.md`
  const apiUrl = `https://api.github.com/repos/thefloridaflow/The-Florida-Flow/contents/${path}`

  // Check if file already exists (need its SHA to update)
  let sha: string | undefined
  try {
    const check = await fetch(apiUrl, {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' },
    })
    if (check.ok) {
      const existing = await check.json()
      sha = existing.sha
    }
  } catch {
    // File doesn't exist — that's fine
  }

  const putBody: Record<string, string> = {
    message: `newsletter draft ${date}`,
    content: Buffer.from(content).toString('base64'),
  }
  if (sha) putBody.sha = sha

  const put = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(putBody),
  })

  if (!put.ok) {
    const err = await put.text()
    return NextResponse.json({ error: `GitHub API error: ${err}` }, { status: 502 })
  }

  return NextResponse.json({ ok: true, path })
}
