'use client'

import { CommunityReport } from '@/lib/supabase'

const CURRENT_COLORS: Record<string, string> = {
  None: 'bg-emerald-900 text-emerald-300',
  Light: 'bg-yellow-900 text-yellow-300',
  Moderate: 'bg-orange-900 text-orange-300',
  Strong: 'bg-red-900 text-red-300',
}

function visibilityLabel(ft: number): string {
  if (ft >= 60) return 'Excellent'
  if (ft >= 30) return 'Good'
  if (ft >= 15) return 'Fair'
  return 'Poor'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

export default function ReportsList({ reports }: { reports: CommunityReport[] }) {
  if (reports.length === 0) {
    return (
      <div className="text-center py-10 text-slate-500">
        <p className="text-3xl mb-2">🤿</p>
        <p>No reports yet. Be the first to submit one!</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {reports.map(r => (
        <div key={r.id} className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
            <div>
              <span className="text-white font-semibold">{r.name}</span>
              <span className="text-slate-400 text-sm ml-2">at</span>
              <span className="text-cyan-300 text-sm ml-2 font-medium">{r.dive_site}</span>
            </div>
            <span className="text-xs text-slate-500">{formatDate(r.created_at)}</span>
          </div>

          <div className="flex flex-wrap gap-2 mb-2">
            <span className="text-sm bg-slate-700 text-white px-2 py-0.5 rounded-full">
              👁 {r.visibility_ft} ft — {visibilityLabel(r.visibility_ft)}
            </span>
            <span className={`text-sm px-2 py-0.5 rounded-full font-medium ${CURRENT_COLORS[r.current_strength] ?? 'bg-slate-700 text-slate-300'}`}>
              ↔ {r.current_strength} current
            </span>
          </div>

          {r.notes && <p className="text-slate-300 text-sm leading-relaxed">{r.notes}</p>}
        </div>
      ))}
    </div>
  )
}
