'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { CommunityReport } from '@/lib/supabase'
import ReportForm from './ReportForm'
import ReportsList from './ReportsList'

export default function CommunitySection() {
  const [reports, setReports] = useState<CommunityReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [siteFilter, setSiteFilter] = useState<string>('all')

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch('/api/reports')
      if (!res.ok) throw new Error('Failed to load reports')
      const data = await res.json()
      setReports(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  const sites = useMemo(() => {
    const s = new Set(reports.map(r => r.dive_site.trim()))
    return Array.from(s).sort()
  }, [reports])

  const filtered = useMemo(
    () => siteFilter === 'all' ? reports : reports.filter(r => r.dive_site.trim() === siteFilter),
    [reports, siteFilter],
  )

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-bold text-white">Community Reports</h2>
        <span className="bg-cyan-900 text-cyan-300 text-xs font-bold px-2 py-1 rounded-full">
          Last 20
        </span>
      </div>

      <ReportForm onSuccess={fetchReports} />

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h3 className="text-slate-300 font-semibold">Recent Reports</h3>
          {sites.length > 1 && (
            <select
              value={siteFilter}
              onChange={e => setSiteFilter(e.target.value)}
              className="bg-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 border border-slate-600 focus:outline-none focus:border-cyan-500"
            >
              <option value="all">All sites ({reports.length})</option>
              {sites.map(s => (
                <option key={s} value={s}>
                  {s} ({reports.filter(r => r.dive_site.trim() === s).length})
                </option>
              ))}
            </select>
          )}
        </div>
        {loading ? (
          <div className="text-slate-500 text-sm py-6 text-center">Loading reports...</div>
        ) : error ? (
          <div className="text-red-400 text-sm py-6 text-center">Error: {error}</div>
        ) : (
          <ReportsList reports={filtered} />
        )}
      </div>
    </section>
  )
}
