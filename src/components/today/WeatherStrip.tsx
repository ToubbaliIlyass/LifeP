'use client'

import { useEffect, useState } from 'react'

interface Weather {
  temperature: number
  feelsLike: number
  high: number
  low: number
  precipitationChance: number | null
  label: string
  icon: string
}

/**
 * Today's weather, shown only once a location has been set in Settings.
 *
 * Deliberately quiet: it is context for the day, not something to act on, so
 * it must not compete with the habits and tasks below it. If the forecast
 * cannot be fetched it renders nothing at all rather than showing an error —
 * a broken weather widget should never be the most prominent thing on the
 * dashboard.
 */
export function WeatherStrip({ lat, lon, place }: { lat: number; lon: number; place: string | null }) {
  const [weather, setWeather] = useState<Weather | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/weather?lat=${lat}&lon=${lon}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('unavailable'))))
      .then((d: { weather: Weather }) => { if (!cancelled) setWeather(d.weather) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [lat, lon])

  if (failed || !weather) return null

  return (
    <div className="flex items-center gap-3 mb-6 px-3 py-2.5 rounded-lg bg-muted/20">
      <span className="text-[20px] leading-none" aria-hidden="true">{weather.icon}</span>
      <div className="flex items-baseline gap-2 flex-1 min-w-0">
        <span className="text-[17px] font-serif text-foreground/85 tabular-nums">{weather.temperature}°</span>
        <span className="text-[12px] text-muted-foreground/70 truncate">{weather.label}</span>
      </div>
      <div className="flex items-center gap-2.5 text-[10px] font-mono text-muted-foreground/55 shrink-0">
        <span className="tabular-nums">{weather.high}° / {weather.low}°</span>
        {weather.precipitationChance !== null && weather.precipitationChance > 0 && (
          <span className="tabular-nums">{weather.precipitationChance}% rain</span>
        )}
        {place && <span className="hidden sm:inline truncate max-w-[14ch]">{place}</span>}
      </div>
    </div>
  )
}
