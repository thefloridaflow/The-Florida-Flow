'use client'

import { useState } from 'react'

export default function EmailCapture({ variant = 'inline' }: { variant?: 'inline' | 'hero' }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setState('loading')
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) throw new Error('Failed')
      setState('done')
      setEmail('')
    } catch {
      setState('error')
    }
  }

  if (variant === 'hero') {
    return (
      <div className="flex flex-col items-center gap-3">
        {state === 'done' ? (
          <p className="text-emerald-400 font-medium">Check your email to confirm! 🤙</p>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="flex gap-2 w-full max-w-sm">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="your@email.com"
                className="flex-1 bg-slate-800 border border-slate-600 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 placeholder-slate-500"
              />
              <button
                type="submit"
                disabled={state === 'loading'}
                className="shrink-0 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-600 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
              >
                {state === 'loading' ? '...' : 'Subscribe'}
              </button>
            </form>
            {state === 'error' && (
              <p className="text-red-400 text-xs">Something went wrong — try again.</p>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-2xl px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold text-sm">📬 The Florida Flow Newsletter</p>
        <p className="text-slate-400 text-xs mt-0.5">Weekly conditions, dive reports &amp; what&apos;s worth getting in the water for.</p>
      </div>

      {state === 'done' && (
        <p className="text-emerald-400 text-sm font-medium shrink-0">Check your email to confirm! 🤙</p>
      )}
      {state === 'error' && (
        <p className="text-red-400 text-xs shrink-0">Something went wrong — try again.</p>
      )}

      {state !== 'done' && (
        <form onSubmit={handleSubmit} className="flex gap-2 w-full sm:w-auto shrink-0">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder="your@email.com"
            className="flex-1 sm:w-48 bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 placeholder-slate-500"
          />
          <button
            type="submit"
            disabled={state === 'loading'}
            className="shrink-0 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-600 text-white font-semibold px-4 py-1.5 rounded-lg text-sm transition-colors"
          >
            {state === 'loading' ? '...' : 'Subscribe'}
          </button>
        </form>
      )}
    </div>
  )
}
