const DEG = Math.PI / 180

/**
 * Compute sunrise and sunset times (as UTC Date objects) for a given date
 * and location using a simplified NOAA solar algorithm. Accurate to ~2 min.
 */
export function getSunTimes(
  date: Date,
  lat: number,
  lon: number,
): { sunrise: Date; sunset: Date } {
  const midnightUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())

  // Day of year
  const dayOfYear = Math.round(
    (midnightUtc - Date.UTC(date.getFullYear(), 0, 0)) / 86400000,
  )

  // Solar declination (degrees)
  const declination = -23.45 * Math.cos(DEG * (360 / 365) * (dayOfYear + 10))

  // Equation of time (minutes)
  const B = DEG * (360 / 365) * (dayOfYear - 81)
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B)

  // Solar noon (minutes from midnight UTC)
  // lon is negative for West, so -lon*4 pushes noon later for western longitudes
  const solarNoonUtcMin = 720 - lon * 4 - eot

  // Hour angle at sunrise/sunset (degrees)
  const cosHA = -Math.tan(lat * DEG) * Math.tan(declination * DEG)
  const hourAngle = cosHA >= 1 ? 0 : cosHA <= -1 ? 180 : Math.acos(cosHA) / DEG

  return {
    sunrise: new Date(midnightUtc + (solarNoonUtcMin - hourAngle * 4) * 60000),
    sunset:  new Date(midnightUtc + (solarNoonUtcMin + hourAngle * 4) * 60000),
  }
}
