'use client'

import { useState, useEffect } from 'react'
import { OperatorReport } from '@/app/api/operator-logs/route'

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div className="flex gap-1.5 text-xs">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="text-slate-300">{value}</span>
    </div>
  )
}

const MOCK_VERIFIED_REPORT = {
  operator: 'Space Coast Dive Center',
  location: 'Palm Bay, FL · Space Coast',
  website: 'https://spacecoastdivecenter.com',
  date: 'Today · 6:30 AM',
  visibility: '40–60 ft',
  waterTemp: '74°F',
  current: 'Light — no issues',
  waves: '1–2 ft',
  notes: 'Great morning on the ledges. Saw a large loggerhead near the anchor line. Nitrox fills available, shop opens at 8.',
}

function VerifiedReportCard() {
  return (
    <div className="bg-slate-800 border border-cyan-700/40 rounded-xl p-4 relative">
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        <span className="text-[10px] bg-yellow-900/50 text-yellow-400 border border-yellow-700/40 px-1.5 py-0.5 rounded-full font-semibold">TEST</span>
        <span className="text-[10px] bg-cyan-900/50 text-cyan-400 border border-cyan-700/40 px-1.5 py-0.5 rounded-full font-semibold">✓ VERIFIED</span>
      </div>
      <div className="mb-2">
        <a href={MOCK_VERIFIED_REPORT.website} target="_blank" rel="noopener noreferrer"
           className="text-white font-semibold text-sm hover:text-cyan-400 transition-colors">
          {MOCK_VERIFIED_REPORT.operator}
        </a>
        <p className="text-slate-500 text-xs">{MOCK_VERIFIED_REPORT.location}</p>
        <p className="text-slate-600 text-xs">{MOCK_VERIFIED_REPORT.date}</p>
      </div>
      <div className="space-y-1 mt-2">
        <Field label="Visibility"  value={MOCK_VERIFIED_REPORT.visibility}  />
        <Field label="Water temp"  value={MOCK_VERIFIED_REPORT.waterTemp}   />
        <Field label="Current"     value={MOCK_VERIFIED_REPORT.current}     />
        <Field label="Waves"       value={MOCK_VERIFIED_REPORT.waves}       />
      </div>
      <p className="text-slate-400 text-xs mt-2.5 leading-relaxed italic">"{MOCK_VERIFIED_REPORT.notes}"</p>
    </div>
  )
}

function ReportCard({ r }: { r: OperatorReport }) {
  if (r.linkOnly) {
    return (
      <a href={r.url} target="_blank" rel="noopener noreferrer"
         className="block bg-slate-700/50 hover:bg-slate-700 transition-colors rounded-xl p-4 group">
        <p className="text-white font-semibold text-sm group-hover:text-cyan-400 transition-colors">{r.operator}</p>
        <p className="text-slate-500 text-xs mt-0.5">{r.location}</p>
        <p className="text-cyan-600 text-xs mt-3 group-hover:text-cyan-400 transition-colors">View current conditions →</p>
      </a>
    )
  }

  if (r.error) {
    return (
      <a href={r.url} target="_blank" rel="noopener noreferrer"
         className="block bg-slate-700/50 hover:bg-slate-700 transition-colors rounded-xl p-4 group">
        <p className="text-white font-semibold text-sm">{r.operator}</p>
        <p className="text-slate-500 text-xs mt-0.5">{r.location}</p>
        <p className="text-slate-600 text-xs mt-3">Unavailable — view on site →</p>
      </a>
    )
  }

  return (
    <div className="bg-slate-700/50 rounded-xl p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <a href={r.url} target="_blank" rel="noopener noreferrer"
             className="text-white font-semibold text-sm hover:text-cyan-400 transition-colors">
            {r.operator}
          </a>
          <p className="text-slate-500 text-xs">{r.location}</p>
        </div>
        {r.date && <p className="text-slate-500 text-xs shrink-0">{r.date}</p>}
      </div>
      <div className="space-y-1 mt-2">
        <Field label="Visibility" value={r.visibility} />
        <Field label="Current"    value={r.current}    />
        <Field label="Water temp" value={r.waterTemp}  />
        <Field label="Waves"      value={r.waves}      />
      </div>
      {r.notes && (
        <p className="text-slate-400 text-xs mt-2.5 leading-relaxed italic">"{r.notes}"</p>
      )}
    </div>
  )
}

export default function OperatorLogs() {
  const [reports, setReports] = useState<OperatorReport[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/operator-logs')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setReports(data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-xl font-bold text-white">Operator Logs</h2>
        <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-full">Dive shops & boats</span>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-32 bg-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <VerifiedReportCard />
          {reports.map(r => <ReportCard key={r.operator} r={r} />)}
        </div>
      )}
    </section>
  )
}
