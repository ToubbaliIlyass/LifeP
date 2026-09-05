/**
 * WMO weather codes, which is what Open-Meteo returns.
 *
 * Mapped to a short label and a glyph rather than pulling in an icon set for
 * one small widget.
 */
const CODES: Record<number, { label: string; icon: string }> = {
  0: { label: 'Clear', icon: '☀' },
  1: { label: 'Mostly clear', icon: '🌤' },
  2: { label: 'Partly cloudy', icon: '⛅' },
  3: { label: 'Overcast', icon: '☁' },
  45: { label: 'Fog', icon: '🌫' },
  48: { label: 'Freezing fog', icon: '🌫' },
  51: { label: 'Light drizzle', icon: '🌦' },
  53: { label: 'Drizzle', icon: '🌦' },
  55: { label: 'Heavy drizzle', icon: '🌦' },
  56: { label: 'Freezing drizzle', icon: '🌧' },
  57: { label: 'Freezing drizzle', icon: '🌧' },
  61: { label: 'Light rain', icon: '🌧' },
  63: { label: 'Rain', icon: '🌧' },
  65: { label: 'Heavy rain', icon: '🌧' },
  66: { label: 'Freezing rain', icon: '🌧' },
  67: { label: 'Freezing rain', icon: '🌧' },
  71: { label: 'Light snow', icon: '🌨' },
  73: { label: 'Snow', icon: '🌨' },
  75: { label: 'Heavy snow', icon: '🌨' },
  77: { label: 'Snow grains', icon: '🌨' },
  80: { label: 'Light showers', icon: '🌦' },
  81: { label: 'Showers', icon: '🌦' },
  82: { label: 'Heavy showers', icon: '⛈' },
  85: { label: 'Snow showers', icon: '🌨' },
  86: { label: 'Snow showers', icon: '🌨' },
  95: { label: 'Thunderstorm', icon: '⛈' },
  96: { label: 'Thunderstorm, hail', icon: '⛈' },
  99: { label: 'Thunderstorm, hail', icon: '⛈' },
}

export function describeWeather(code: number): { label: string; icon: string } {
  return CODES[code] ?? { label: 'Unknown', icon: '·' }
}
