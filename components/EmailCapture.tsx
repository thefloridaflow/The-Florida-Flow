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
    <div className="bg-slate-800/60 border border-slate-700 rounded-2xl px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold text-sm">📬 The Florida Flow Newsletter</p>
        <p className="text-slate-400 text-xs mt-0.5">Weekly conditions, dive reports &amp; what&apos;s worth getting in the water for.</p>
      </div>

      {state === 'done' && (
        <p className="text-emerald-400 text-sm font-medium shrink-0">You&apos;re in! 🤙</p>
      )}
      {state === 'already' && (
        <p className="text-cyan-400 text-sm shrink-0">Already subscribed!</p>
      )}
      {state === 'error' && (
        <p className="text-red-400 text-xs shrink-0">{errMsg}</p>
      )}

      {state !== 'done' && state !== 'already' && (
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
