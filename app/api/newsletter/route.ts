import { NextResponse } from 'next/server'

export type NewsletterPost = {
  title: string
  link: string
  pubDate: string
  description: string
}

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}(?:[^>]*)><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}(?:[^>]*)>([\\s\\S]*?)</${tag}>`))
  return (m?.[1] ?? m?.[2] ?? '').trim()
}

export async function GET() {
  const feedUrl = process.env.NEWSLETTER_RSS_URL
  if (!feedUrl) return NextResponse.json({ error: 'Feed not configured' }, { status: 503 })
  try {
    const res = await fetch(feedUrl, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(10000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const xml = await res.text()
    const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? []
    const posts: NewsletterPost[] = itemBlocks.slice(0, 5).map(block => ({
      title:       extractTag(block, 'title'),
      link:        extractTag(block, 'link'),
      pubDate:     extractTag(block, 'pubDate'),
      description: extractTag(block, 'description').replace(/<[^>]+>/g, '').slice(0, 200).trim(),
    }))
    return NextResponse.json(posts)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
