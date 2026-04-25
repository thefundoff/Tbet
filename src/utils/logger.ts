type Level = 'info' | 'warn' | 'error'

function log(level: Level, message: string, data?: unknown): void {
  const ts = new Date().toISOString()
  const payload = data !== undefined ? { message, data } : { message }
  console[level](`[${ts}] [${level.toUpperCase()}]`, JSON.stringify(payload))
}

export const logger = {
  info:  (msg: string, data?: unknown) => log('info',  msg, data),
  warn:  (msg: string, data?: unknown) => log('warn',  msg, data),
  error: (msg: string, data?: unknown) => log('error', msg, data),
}
