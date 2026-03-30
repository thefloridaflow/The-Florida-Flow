'use client'

import { MarineForecast } from '@/lib/noaa'

export default function ForecastPanel({ forecast }: { forecast: MarineForecast }) {
  const updated = forecast.updated
    ? new Date(forecast.updated).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
        timeZone: 'America/New_York',
      }) + ' ET'
    : 'Unknown'

  return (
    <div className="bg-slate-800 rounded-2xl p-5 shadow-lg">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">⛵</span>
        <div>
          <h3 className="text-white font-bold text-lg">Marine Forecast</h3>
          <p className="text-slate-400 text-sm">{forecast.name} · NWS Zone {forecast.zone}</p>
        </div>
      </div>

      {forecast.error ? (
        <p className="text-red-400 text-sm">Forecast unavailable: {forecast.error}</p>
      ) : (
        <pre className="text-slate-300 text-sm whitespace-pre-wrap font-sans leading-relaxed max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600">
          {forecast.forecast || 'No forecast text available.'}
        </pre>
      )}

      <p className="text-xs text-slate-500 mt-3">Issued: {updated}</p>
    </div>
  )
}
