import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { describeWeather } from '@/lib/weather'

/**
 * Today's weather from Open-Meteo.
 *
 * Chosen because it needs no API key and no account — nothing to store, leak
 * or rotate, and no signup standing between this and working. Called from the
 * server rather than the browser so the coordinates never appear in client
 * network logs and the response can be cached.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const { searchParams } = new URL(request.url)
  const lat = parseFloat(searchParams.get('lat') ?? '')
  const lon = parseFloat(searchParams.get('lon') ?? '')

  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return Response.json({ error: 'Valid lat and lon are required' }, { status: 400 })
  }

  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,apparent_temperature,weather_code' +
    '&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max' +
    '&timezone=auto&forecast_days=1'

  try {
    // Weather does not change minute to minute, and the dashboard remounts
    // often — half an hour of caching keeps this from being re-fetched on
    // every visit to Today.
    const res = await fetch(url, { next: { revalidate: 1800 } })
    if (!res.ok) {
      return Response.json({ error: 'Weather service unavailable' }, { status: 502 })
    }

    const data = (await res.json()) as {
      current?: { temperature_2m?: number; apparent_temperature?: number; weather_code?: number }
      daily?: {
        temperature_2m_max?: number[]
        temperature_2m_min?: number[]
        weather_code?: number[]
        precipitation_probability_max?: number[]
      }
      timezone?: string
    }

    const code = data.current?.weather_code ?? data.daily?.weather_code?.[0] ?? 0
    const { label, icon } = describeWeather(code)

    return Response.json({
      weather: {
        temperature: Math.round(data.current?.temperature_2m ?? 0),
        feelsLike: Math.round(data.current?.apparent_temperature ?? 0),
        high: Math.round(data.daily?.temperature_2m_max?.[0] ?? 0),
        low: Math.round(data.daily?.temperature_2m_min?.[0] ?? 0),
        precipitationChance: data.daily?.precipitation_probability_max?.[0] ?? null,
        label,
        icon,
        timezone: data.timezone ?? null,
      },
    })
  } catch {
    // A weather widget must never be able to break the dashboard.
    return Response.json({ error: 'Could not reach the weather service' }, { status: 502 })
  }
}
