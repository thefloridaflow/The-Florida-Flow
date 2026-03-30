import { getSunTimes } from '@/lib/sun'

// Lake Worth / Palm Beach area
const LAT = 26.713
const LON = -80.057

function fmt(d: Date): string {
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York',
  })
}

export default function SunTimes() {
  const today = new Date()
  const { sunrise, sunset } = getSunTimes(today, LAT, LON)

  const morningGoldenEnd = new Date(sunrise.getTime() + 45 * 60000)
  const eveningGoldenStart = new Date(sunset.getTime() - 45 * 60000)

  const rows = [
    { label: 'Sunrise',              value: fmt(sunrise),                                  color: 'text-yellow-300' },
    { label: 'Morning golden hour',  value: `${fmt(sunrise)} – ${fmt(morningGoldenEnd)}`,  color: 'text-orange-300' },
    { label: 'Evening golden hour',  value: `${fmt(eveningGoldenStart)} – ${fmt(sunset)}`, color: 'text-orange-300' },
    { label: 'Sunset',               value: fmt(sunset),                                   color: 'text-orange-400' },
  ]

  return (
    <div className="bg-slate-800 rounded-2xl p-5 shadow-lg">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">☀️</span>
        <div>
          <h3 className="text-white font-bold text-lg">Sun Times</h3>
          <p className="text-slate-400 text-sm">Palm Beach, FL · Eastern Time</p>
        </div>
      </div>
      <div className="space-y-2">
        {rows.map(({ label, value, color }) => (
          <div key={label} className="flex items-center justify-between bg-slate-700 rounded-lg px-3 py-2">
            <span className="text-slate-400 text-sm">{label}</span>
            <span className={`font-medium text-sm ${color}`}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
