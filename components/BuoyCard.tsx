'use client'

import { BuoyData } from '@/lib/noaa'

function Stat({ label, value, unit }: { label: string; value: string | null; unit?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-cyan-400 uppercase tracking-wider font-medium">{label}</span>
      <span className="text-lg font-bold text-white">
        {value ?? <span className="text-slate-500 text-sm">N/A</span>}
        {value && unit && <span className="text-sm text-slate-400 ml-1">{unit}</span>}
      </span>
    </div>
  )
}

function waveConditionColor(heightFt: string | null): string {
  if (!heightFt) return 'border-slate-700'
  const h = parseFloat(heightFt)
  if (h < 2) return 'border-emerald-500'
  if (h < 4) return 'border-yellow-500'
  if (h < 6) return 'border-orange-500'
  return 'border-red-500'
}

export default function BuoyCard({ buoy }: { buoy: BuoyData }) {
  const borderColor = waveConditionColor(buoy.waveHeight)

  return (
    <div className={`bg-slate-800 rounded-2xl border-l-4 ${borderColor} p-5 shadow-lg`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-white font-bold text-lg leading-tight">{buoy.name}</h3>
          <p className="text-slate-400 text-sm">{buoy.region}</p>
        </div>
        <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-full font-mono">
          #{buoy.stationId}
        </span>
      </div>

      {buoy.error ? (
        <p className="text-red-400 text-sm">Data unavailable: {buoy.error}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Wave Height" value={buoy.waveHeight} unit="ft" />
          <Stat label="Wave Period" value={buoy.wavePeriod} unit="s" />
          <Stat label="Water Temp" value={buoy.waterTemp} unit="°F" />
          <Stat
            label="Wind"
            value={buoy.windSpeed && buoy.windDir ? `${buoy.windSpeed} kt ${buoy.windDir}` : buoy.windSpeed}
          />
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-slate-500">Updated: {new Date(buoy.updated).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' })} ET</p>
        <p className="text-xs text-slate-600 font-mono">
          {buoy.lat.toFixed(3)}, {buoy.lon.toFixed(3)}
          {buoy.offshoreNm > 0 && <span className="ml-2 text-slate-500">{buoy.offshoreNm} nm offshore</span>}
        </p>
      </div>
    </div>
  )
}
