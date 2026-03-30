'use client'

import { useState, useEffect } from 'react'
import { BHBDay } from '@/app/api/bhb-tides/route'

const qualityStyle = {
  optimal: { badge: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30', label: '★★ Optimal' },
  good:    { badge: 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',         label: '★ Good'    },
  fair:    { badge: 'bg-slate-700/60 text-slate-400 border border-slate-600',          label: 'Fair'      },
}

export default function BHBTideWindows() {
  const [days, setDays] = useState<BHBDay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/api/bhb-tides')
      .then(r => r.json())
      .then(data => { if (!data.error) setDays(data); else setError(true) })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="bg-slate-800 rounded-2xl p-5 shadow-lg">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">🐠</span>
        <div>
          <h3 className="text-white font-bold text-lg">BHB Dive Windows</h3>
          <p className="text-slate-400 text-sm">
            Blue Heron Bridge · via{' '}
            <a href="https://www.idiveflorida.com" target="_blank" rel="noopener noreferrer"
               className="text-cyan-500 hover:text-cyan-400 transition-colors">iDiveFlorida</a>
          </p>
        </div>
      </div>

      {loading && (
        <div className="space-y-3">
          {[1,2].map(i => <div key={i} className="h-14 bg-slate-700 rounded-xl animate-pulse" />)}
        </div>
      )}

      {error && (
        <p className="text-slate-500 text-sm">Windows unavailable — check{' '}
          <a href="https://www.idiveflorida.com/BlueHeronBridgeTideTableChart.php"
             target="_blank" rel="noopener noreferrer"
             className="text-cyan-500 hover:text-cyan-400">iDiveFlorida</a> directly.
        </p>
      )}

      {!loading && !error && (
        <div className="space-y-4">
          {days.map(day => (
            <div key={day.date}>
              <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-2">{day.label}</p>
              <div className="space-y-2">
                {day.tides.map((tide, i) => {
                  const s = qualityStyle[tide.quality]
                  return (
                    <div key={i} className="flex items-center justify-between bg-slate-700/50 rounded-xl px-4 py-2.5 gap-3">
                      <div>
                        <p className="text-white text-sm font-medium">High tide {tide.time}</p>
                        <p className="text-slate-500 text-xs mt-0.5">
                          Window: {tide.windowStart} – {tide.windowEnd}
                          <span className="ml-1 text-slate-600">({tide.height} ft)</span>
                        </p>
                      </div>
                      <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${s.badge}`}>
                        {s.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          <p className="text-xs text-slate-600 mt-1">Enter 30 min before high tide, exit 30 min after.</p>
        </div>
      )}
    </div>
  )
}
