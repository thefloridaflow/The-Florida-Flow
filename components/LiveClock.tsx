'use client'

import { useEffect, useState } from 'react'

function etTime() {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit', minute: '2-digit',
    hour12: false, timeZoneName: 'short',
  }).formatToParts(now)
  const h = parts.find(p => p.type === 'hour')?.value ?? '--'
  const m = parts.find(p => p.type === 'minute')?.value ?? '--'
  const tz = parts.find(p => p.type === 'timeZoneName')?.value ?? 'ET'
  return `${h}:${m} ${tz}`
}

export default function LiveClock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    setTime(etTime())
    const t = setInterval(() => setTime(etTime()), 30_000)
    return () => clearInterval(t)
  }, [])
  return <span suppressHydrationWarning>{time || '— ET'}</span>
}
