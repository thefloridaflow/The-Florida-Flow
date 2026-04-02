'use client'

import { useState } from 'react'

const LOCATIONS = [
  'Space Coast (Cocoa / Sebastian)',
  'Treasure Coast (Vero / Ft Pierce)',
  'Palm Beach / Boca',
  'Fort Lauderdale / Deerfield / Pompano',
  'Miami / Biscayne',
  'Key Largo / Upper Keys',
  'Marathon / Middle Keys',
  'Key West / Lower Keys',
  'Other Florida',
  'Outside Florida',
]

const INTERESTS = [
  { id: 'Beach',              label: '🏖️ Beach / Swimming' },
  { id: 'Boating',            label: '⛵ Boating' },
  { id: 'Fishing',            label: '🎣 Fishing' },
  { id: 'Scuba',              label: '🤿 Scuba / Freediving' },
  { id: 'Surfing',            label: '🏄 Surfing / Bodyboarding' },
  { id: 'Kayak / SUP',        label: '🚣 Kayak / SUP' },
]

export default function EmailCapture({ variant = 'inline' }: { variant?: 'inline' | 'hero' }) {
  const [email, setEmail]         = useState('')
  const [step, setStep]           = useState<'email' | 'prefs' | 'done'>('email')
  const [submitState, setSubmit]  = useState<'idle' | 'loading' | 'error'>('idle')
  const [location, setLocation]   = useState('')
  const [interests, setInterests] = useState<Set<string>>(new Set())
  const [prefsSaving, setPrefsSaving] = useState(false)

  const toggleInterest = (id: string) => {
    setInterests(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmit('loading')
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) throw new Error('Failed')
      setStep('prefs')
      setSubmit('idle')
    } catch {
      setSubmit('error')
    }
  }

  const handlePrefs = async (skip = false) => {
    if (!skip && (location || interests.size > 0)) {
      setPrefsSaving(true)
      try {
        await fetch('/api/subscribe/preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, location: location || undefined, interests: [...interests] }),
        })
      } catch {
        // best-effort — don't block the user
      }
      setPrefsSaving(false)
    }
    setStep('done')
  }

  if (variant === 'hero') {
    return (
      <div className="flex flex-col items-center gap-3 w-full max-w-sm mx-auto">
        {step === 'done' && (
          <p className="text-emerald-400 font-medium text-center">You&apos;re in. Check your email to confirm.</p>
        )}

        {step === 'email' && (
          <>
            <form onSubmit={handleSubscribe} className="flex gap-2 w-full">
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
                disabled={submitState === 'loading'}
                className="shrink-0 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-600 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
              >
                {submitState === 'loading' ? '...' : 'Subscribe'}
              </button>
            </form>
            {submitState === 'error' && (
              <p className="text-red-400 text-xs">Something went wrong — try again.</p>
            )}
          </>
        )}

        {step === 'prefs' && (
          <PrefsPanel
            location={location}
            interests={interests}
            saving={prefsSaving}
            onLocationChange={setLocation}
            onToggleInterest={toggleInterest}
            onDone={() => handlePrefs(false)}
            onSkip={() => handlePrefs(true)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-2xl px-5 py-4 flex flex-col gap-4">
      <div>
        <p className="text-white font-semibold text-sm">📬 The Florida Flow Newsletter</p>
        <p className="text-slate-400 text-xs mt-0.5">Daily conditions, dive reports &amp; what&apos;s worth getting in the water for.</p>
      </div>

      {step === 'done' && (
        <p className="text-emerald-400 text-sm font-medium">You&apos;re in. Check your email to confirm.</p>
      )}

      {step === 'email' && (
        <>
          <form onSubmit={handleSubscribe} className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="your@email.com"
              className="flex-1 bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 placeholder-slate-500"
            />
            <button
              type="submit"
              disabled={submitState === 'loading'}
              className="shrink-0 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-600 text-white font-semibold px-4 py-1.5 rounded-lg text-sm transition-colors"
            >
              {submitState === 'loading' ? '...' : 'Subscribe'}
            </button>
          </form>
          {submitState === 'error' && (
            <p className="text-red-400 text-xs">Something went wrong — try again.</p>
          )}
        </>
      )}

      {step === 'prefs' && (
        <PrefsPanel
          location={location}
          interests={interests}
          saving={prefsSaving}
          onLocationChange={setLocation}
          onToggleInterest={toggleInterest}
          onDone={() => handlePrefs(false)}
          onSkip={() => handlePrefs(true)}
        />
      )}
    </div>
  )
}

function PrefsPanel({
  location, interests, saving,
  onLocationChange, onToggleInterest, onDone, onSkip,
}: {
  location: string
  interests: Set<string>
  saving: boolean
  onLocationChange: (v: string) => void
  onToggleInterest: (id: string) => void
  onDone: () => void
  onSkip: () => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-white text-sm font-semibold">Check your email to confirm.</p>
        <p className="text-slate-400 text-xs mt-0.5">While you wait — help us personalize your newsletter. <span className="text-slate-500">(Optional)</span></p>
      </div>

      <div>
        <label className="text-slate-300 text-xs font-medium block mb-1">Where do you get in the water?</label>
        <select
          value={location}
          onChange={e => onLocationChange(e.target.value)}
          className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
        >
          <option value="">Select your area…</option>
          {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      <div>
        <label className="text-slate-300 text-xs font-medium block mb-1.5">What do you do? <span className="text-slate-500 font-normal">Select all that apply</span></label>
        <div className="grid grid-cols-2 gap-1.5">
          {INTERESTS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => onToggleInterest(id)}
              className={`text-left px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                interests.has(id)
                  ? 'bg-cyan-900/60 border-cyan-500 text-cyan-200'
                  : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onDone}
          disabled={saving}
          className="flex-1 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-600 text-white font-semibold px-4 py-1.5 rounded-lg text-sm transition-colors"
        >
          {saving ? 'Saving…' : 'Save preferences'}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="px-4 py-1.5 rounded-lg text-sm text-slate-400 hover:text-slate-300 transition-colors"
        >
          Skip
        </button>
      </div>
    </div>
  )
}
