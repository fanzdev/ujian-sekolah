export type LogLevel = 'INFO' | 'WARN' | 'ERROR'

export type LogSink = (level: LogLevel, line: string) => void

export interface Logger {
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}

function defaultSink(level: LogLevel, line: string): void {
  if (level === 'ERROR') console.error(line)
  else if (level === 'WARN') console.warn(line)
  else console.log(line)
}

export function createLogger(options?: { production?: boolean; sink?: LogSink }): Logger {
  const production = options?.production ?? false
  const sink = options?.sink ?? defaultSink
  const emit = (level: LogLevel, message: string): void => {
    if (production && level === 'INFO' && !/success/i.test(message)) return
    sink(level, `[AI-MANAGER][${level}][${new Date().toISOString()}] ${message}`)
  }
  return {
    info: (message: string) => emit('INFO', message),
    warn: (message: string) => emit('WARN', message),
    error: (message: string) => emit('ERROR', message),
  }
}

export function nullLogger(): Logger {
  return { info: () => undefined, warn: () => undefined, error: () => undefined }
}
