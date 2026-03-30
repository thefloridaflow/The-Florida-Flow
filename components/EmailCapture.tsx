'use client'

import { useState } from 'react'

export default function EmailCapture() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'already' | 'error'>('idle')
  const [errMsg, setErrMsg] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setState('loading')
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed')
      setState(json.already ? 'already' : 'done')
      setEmail('')
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Something went wrong')
      setState('error')
    }
  }

  return (
    <div className="bg-gradient-to-br from-cyan-900/40 to-slate-800 border border-cyan-800/50 rounded-2xl p-6 shadow-lg">
      <div className="flex items-start gap-4">
        <span className="text-3xl">🌊</span>
        <div className="flex-1">
          <h3 className="text-white font-bold text-lg leading-tight">The Florida Flow Newsletter</h3>
          <p className="text-slate-400 text-sm mt-1 mb-4">
            Weekly conditions, dive reports, and what&apos;s worth getting in the water for — straight to your inbox.
          </p>

          {state === 'done' && (
            <p className="text-emerald-400 text-sm font-medium">You&apos;re in! Check your inbox for a confirmation.</p>
          )}
          {state === 'already' && (
            <p className="text-cyan-400 text-sm font-medium">You&apos;re already subscribed — we&apos;ll see you in the next issue.</p>
          )}
          {state === 'error' && (
            <p className="text-red-400 text-sm">{errMsg}</p>
          )}

          {state !== 'done' && state !== 'already' && (
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="your@email.com"
                className="flex-1 bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 placeholder-slate-500"
              />
              <button
                type="submit"
                disabled={state === 'loading'}
                className="shrink-0 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-600 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
              >
                {state === 'loading' ? '...' : 'Subscribe'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
