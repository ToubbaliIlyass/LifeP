type Level = 'info' | 'warn' | 'error' | 'debug'

interface LogEntry {
  level: Level
  message: string
  data?: unknown
  timestamp: string
}

function log(level: Level, message: string, data?: unknown): void {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(data !== undefined && { data }),
  }
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  fn(JSON.stringify(entry))
}

export const logger = {
  info: (message: string, data?: unknown) => log('info', message, data),
  warn: (message: string, data?: unknown) => log('warn', message, data),
  error: (message: string, data?: unknown) => log('error', message, data),
  debug: (message: string, data?: unknown) => {
    if (process.env.NODE_ENV !== 'production') log('debug', message, data)
  },
}
