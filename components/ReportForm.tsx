'use client'

import { useState } from 'react'

type FormState = {
  name: string
  dive_site: string
  visibility_ft: string
  current_strength: string
  notes: string
}

const INITIAL: FormState = {
  name: '',
  dive_site: '',
  visibility_ft: '',
  current_strength: '',
  notes: '',
}

export default function ReportForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState<FormState>(INITIAL)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          visibility_ft: Number(form.visibility_ft),
        }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'Submission failed')
      }
      setSuccess(true)
      setForm(INITIAL)
      onSuccess()
      setTimeout(() => setSuccess(false), 4000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass =
    'w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 placeholder-slate-500'

  return (
    <form onSubmit={handleSubmit} className="bg-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
      <h3 className="text-white font-bold text-lg">Submit a Dive Report</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-cyan-400 uppercase tracking-wider font-medium mb-1">Your Name</label>
          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            required
            maxLength={100}
            placeholder="Captain Dave"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs text-cyan-400 uppercase tracking-wider font-medium mb-1">Dive Site</label>
          <input
            name="dive_site"
            value={form.dive_site}
            onChange={handleChange}
            required
            maxLength={150}
            placeholder="Blue Heron Bridge"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs text-cyan-400 uppercase tracking-wider font-medium mb-1">Visibility (ft)</label>
          <input
            name="visibility_ft"
            value={form.visibility_ft}
            onChange={handleChange}
            required
            type="number"
            min="0"
            max="200"
            placeholder="30"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs text-cyan-400 uppercase tracking-wider font-medium mb-1">Current Strength</label>
          <select
            name="current_strength"
            value={form.current_strength}
            onChange={handleChange}
            required
            className={inputClass}
          >
            <option value="" disabled>Select...</option>
            <option value="None">None</option>
            <option value="Light">Light</option>
            <option value="Moderate">Moderate</option>
            <option value="Strong">Strong</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs text-cyan-400 uppercase tracking-wider font-medium mb-1">Notes</label>
        <textarea
          name="notes"
          value={form.notes}
          onChange={handleChange}
          maxLength={500}
          rows={3}
          placeholder="Saw a huge goliath grouper near the bridge..."
          className={inputClass}
        />
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {success && <p className="text-emerald-400 text-sm">Report submitted! Thanks for the update.</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm"
      >
        {submitting ? 'Submitting...' : 'Submit Report'}
      </button>
    </form>
  )
}
