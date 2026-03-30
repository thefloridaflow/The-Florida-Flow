'use client'

import { useState, useEffect } from 'react'
import { NewsletterPost } from '@/app/api/newsletter/route'

function formatDate(raw: string): string {
  try {
    return new Date(raw).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return raw }
}

export default function NewsletterArchive() {
  const [posts, setPosts] = useState<NewsletterPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/newsletter')
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error)
        else setPosts(data)
      })
      .catch(() => setError('Could not load issues'))
      .finally(() => setLoading(false))
  }, [])

  if (error) return null   // fail silently — newsletter section is non-critical

  return (
    <section>
      <div className="flex items-center gap-2 mb-5">
        <h2 className="text-2xl font-bold text-white">From the Newsletter</h2>
        <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-full">Recent Issues</span>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-slate-800 rounded-2xl p-5 animate-pulse h-32" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {posts.map(post => (
            <a
              key={post.link}
              href={post.link}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-cyan-700 rounded-2xl p-5 shadow-lg transition-colors group block"
            >
              <p className="text-xs text-cyan-500 mb-2">{formatDate(post.pubDate)}</p>
              <h3 className="text-white font-semibold text-sm leading-snug mb-2 group-hover:text-cyan-300 transition-colors">
                {post.title}
              </h3>
              {post.description && (
                <p className="text-slate-500 text-xs leading-relaxed line-clamp-3">{post.description}…</p>
              )}
            </a>
          ))}
        </div>
      )}
    </section>
  )
}
