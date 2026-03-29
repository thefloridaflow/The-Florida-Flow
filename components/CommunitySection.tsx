'use client'

import { useState, useEffect, useCallback } from 'react'
import { CommunityReport } from '@/lib/supabase'
import ReportForm from './ReportForm'
import ReportsList from './ReportsList'

export default function CommunitySection() {
  const [reports, setReports] = useState<CommunityReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
        <h3 className="text-slate-300 font-semibold mb-3">Recent Reports</h3>
        {loading ? (
          <div className="text-slate-500 text-sm py-6 text-center">Loading reports...</div>
        ) : error ? (
          <div className="text-red-400 text-sm py-6 text-center">Error: {error}</div>
        ) : (
          <ReportsList reports={reports} />
        )}
      </div>
    </section>
  )
}
