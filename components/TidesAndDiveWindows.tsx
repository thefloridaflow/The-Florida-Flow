'use client'

import { useState, useEffect } from 'react'
import { TideData, TidePrediction } from '@/lib/noaa'
import { BHBDay, BHBHighTide } from '@/app/api/bhb-tides/route'

const qualityStyle = {
  optimal: { badge: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30', label: '★★ Optimal' },
  good:    { badge: 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',          label: '★ Good'     },
  fair:    { badge: 'bg-slate-700/60 text-slate-400 border border-slate-600',           label: 'Fair'       },
}

function formatTime(timeStr: string): string {
  const [, time] = timeStr.split(' ')
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${ampm}`
}

function etDateKey(timeStr: string): string {
  // NOAA times are already in ET as "YYYY-MM-DD HH:MM"
  return timeStr.split(' ')[0]
}

function renderRows(preds: TidePrediction[], bhbTides: BHBHighTide[], bhbLoaded: boolean) {
  let highIdx = 0
  return preds.map((p, i) => {
    const isHigh = p.type === 'H'
    const bhb = isHigh && bhbLoaded ? bhbTides[highIdx] : undefined
    if (isHigh) highIdx++
    const s = bhb ? qualityStyle[bhb.quality] : null

    return (
      <div key={i} className="flex items-center gap-3 bg-slate-700/50 rounded-xl px-3 py-2">
        <span className={`text-base shrink-0 ${isHigh ? 'text-blue-400' : 'text-orange-400'}`}>
          {isHigh ? '▲' : '▼'}
        </span>
        <div className="w-22 shrink-0">
          <p className="text-white text-sm font-medium">{formatTime(p.time)}</p>
          <p className="text-slate-500 text-xs">{isHigh ? 'High' : 'Low'} · {p.height} ft</p>
        </div>
        {isHigh && bhb && s && (
          <>
            <p className="flex-1 text-slate-400 text-xs tabular-nums">
              {bhb.windowStart}–{bhb.windowEnd}
            </p>
            <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${s.badge}`}>
              {s.label}
            </span>
          </>
        )}
        {isHigh && !bhb && bhbLoaded && (
          <p className="flex-1 text-slate-600 text-xs">no window data</p>
        )}
      </div>
    )
  })
}

export default function TidesAndDiveWindows({ tides }: { tides: TideData }) {
  const [bhbDays, setBhbDays] = useState<BHBDay[]>([])
  const [bhbLoaded, setBhbLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/bhb-tides')
      .then(r => r.json())
      .then(data => { if (!data.error) setBhbDays(data) })
      .catch(() => {})
      .finally(() => setBhbLoaded(true))
  }, [])

  const now = new Date()
  const etOpts = { timeZone: 'America/New_York' } as const
  const todayKey    = now.toLocaleDateString('en-CA', etOpts)
  const tomorrowDt  = new Date(now); tomorrowDt.setDate(now.getDate() + 1)
  const tomorrowKey = tomorrowDt.toLocaleDateString('en-CA', etOpts)

  const bhbByLabel: Record<string, BHBHighTide[]> = {}
  bhbDays.forEach(d => { bhbByLabel[d.label] = d.tides })

  const groups = [
    { label: 'Today',    key: todayKey,    bhbTides: bhbByLabel['Today']    ?? [] },
    { label: 'Tomorrow', key: tomorrowKey, bhbTides: bhbByLabel['Tomorrow'] ?? [] },
  ].map(g => ({
    ...g,
    preds: tides.predictions.filter(p => etDateKey(p.time) === g.key),
  }))

  return (
    <div className="bg-slate-800 rounded-2xl p-5 shadow-lg">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">🌊</span>
        <div>
          <h3 className="text-white font-bold text-lg">Tides & Dive Windows</h3>
          <p className="text-slate-400 text-sm">
            BHB Station 8722588 · windows via{' '}
            <a href="https://www.idiveflorida.com" target="_blank" rel="noopener noreferrer"
               className="text-cyan-500 hover:text-cyan-400 transition-colors">iDiveFlorida</a>
          </p>
        </div>
      </div>

      {tides.error ? (
        <p className="text-red-400 text-sm">Tide data unavailable: {tides.error}</p>
      ) : (
        <div className="space-y-4">
          {groups.map(({ label, preds, bhbTides }) =>
            preds.length > 0 && (
              <div key={label}>
                <p className="text-cyan-400 text-xs uppercase tracking-wider font-medium mb-2">{label}</p>
                <div className="space-y-1.5">
                  {renderRows(preds, bhbTides, bhbLoaded)}
                </div>
              </div>
            )
          )}
          {tides.predictions.length === 0 && (
            <p className="text-slate-400 text-sm">No predictions available.</p>
          )}
          <p className="text-xs text-slate-600">Enter 30 min before high tide, exit 30 min after.</p>
        </div>
      )}
    </div>
  )
}
