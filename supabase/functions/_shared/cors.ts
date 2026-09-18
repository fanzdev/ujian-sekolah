const BUILTIN_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000']

function extraOrigins(): string[] {
  const raw = Deno.env.get('ALLOWED_ORIGINS') ?? ''
  return raw
    .split(',')
    .map((item) => item.trim().replace(/\/+$/, ''))
    .filter((item) => item !== '')
}

export function resolveCorsHeaders(req: Request, extraOrigin?: string): Record<string, string> {
  const origin = (req.headers.get('origin') ?? '').replace(/\/+$/, '')
  const allowedOrigins = new Set<string>([...BUILTIN_ORIGINS, ...extraOrigins()])
  if (extraOrigin) allowedOrigins.add(extraOrigin.replace(/\/+$/, ''))
  const allowed = origin !== '' && allowedOrigins.has(origin)
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
  if (allowed) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

export function jsonResponse(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

export function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return jsonResponse(body, status, cors)
}

export function error(message: string, status: number, cors: Record<string, string>): Response {
  return jsonResponse({ error: message }, status, cors)
}

type Handler = (req: Request) => Promise<Response>

export function alwaysIncludeCors(handler: Handler): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const cors = resolveCorsHeaders(req)
    if (req.method === 'OPTIONS') {
      return new Response('ok', { status: 200, headers: cors })
    }
    try {
      return await handler(req)
    } catch (err) {
      console.error('[edge] unhandled error:', err instanceof Error ? `${err.name}: ${err.message}` : String(err))
      return jsonResponse({ error: 'Terjadi kesalahan tak terduga di server. Coba lagi nanti.' }, 500, cors)
    }
  }
}
