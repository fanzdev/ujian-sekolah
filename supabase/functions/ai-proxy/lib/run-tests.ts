import { discoverProviders, type EnvReader } from './env-parser.ts'
import { filterFreeModels, fetchFreeModels, listAllModelIds } from './model-fetcher.ts'
import { createLogger } from './logger.ts'
import { generateWithFallback } from './manager.ts'
import {
  generateQuestions,
  gradeEssay,
  analyzeResult,
  generateExplanation,
  refineQuestions,
  buildGeneratePrompt,
  sanitizeText,
  extractJson,
} from './features.ts'

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++
    console.log(`PASS ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function envOf(entries: Record<string, string>): EnvReader {
  return (key: string) => entries[key]
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function modelsBody(ids: { id: string; prompt?: number | string; completion?: number | string }[]): unknown {
  return { data: ids.map((m) => ({ id: m.id, pricing: { prompt: m.prompt ?? 0, completion: m.completion ?? 0 } })) }
}

function chatBody(content: string): unknown {
  return { choices: [{ message: { role: 'assistant', content } }] }
}

type Route = { match: (url: string, init?: RequestInit) => boolean; respond: () => Response | Promise<Response> }

function mockFetch(routes: Route[]): typeof fetch {
  return (async (url: unknown, init?: RequestInit): Promise<Response> => {
    const u = String(url)
    for (const route of routes) {
      if (route.match(u, init)) {
        const pending = route.respond()
        const signal = init?.signal
        if (!signal || typeof (signal as AbortSignal).addEventListener !== 'function') return pending
        const abortSignal = signal as AbortSignal
        if (abortSignal.aborted) throw new Error('aborted')
        return (await Promise.race([
          pending,
          new Promise<never>((_, reject) => {
            abortSignal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
          }),
        ])) as Response
      }
    }
    return jsonResponse({ error: 'not mocked' }, 404)
  }) as typeof fetch
}

function isModels(url: string): boolean {
  return url.endsWith('/models')
}

function modelOf(init?: RequestInit): string {
  try {
    return String((JSON.parse(String((init?.body ?? '{}'))) as { model?: string }).model ?? '')
  } catch {
    return ''
  }
}

const silent = createLogger({ sink: () => undefined })

async function main(): Promise<void> {
  const sequential = discoverProviders(envOf({ AI_BASE_URL_01: 'https://a.example/v1', AI_API_KEY_01: 'k1', AI_BASE_URL_02: 'https://b.example/v1' }))
  check('ENV pasangan tanpa kunci dilewati', sequential.providers.length === 1 && sequential.providers[0].label === 'Provider-01')

  const skipKey = discoverProviders(envOf({ AI_BASE_URL_01: 'https://a.example/v1', AI_BASE_URL_02: 'https://b.example/v1', AI_API_KEY_02: 'k2' }))
  check('ENV skip pasangan tanpa kunci', skipKey.providers.length === 1 && skipKey.providers[0].index === 2 && skipKey.warnings.length === 1)

  const empty = discoverProviders(envOf({}))
  check('ENV kosong tanpa provider', empty.providers.length === 0)

  const gapped = discoverProviders(envOf({ AI_BASE_URL_01: 'https://a.example/v1', AI_API_KEY_01: 'k1', AI_BASE_URL_03: 'https://c.example/v1', AI_API_KEY_03: 'k3' }))
  check('ENV nomor loncat tetap terbaca', gapped.providers.length === 2 && gapped.providers[0].index === 1 && gapped.providers[1].index === 3)

  const labeled = discoverProviders(envOf({ AI_BASE_URL_01: 'https://api.groq.com/openai/v1', AI_API_KEY_01: 'gsk-x', AI_BASE_URL_02: 'https://openrouter.ai/api/v1', AI_API_KEY_02: 'sk-or-x' }))
  check('ENV label otomatis per provider', labeled.providers.length === 2 && labeled.providers[0].label === 'Groq-01' && labeled.providers[1].label === 'OpenRouter-02')

  const free = filterFreeModels(modelsBody([
    { id: 'x/y:model-a:free' },
    { id: 'Free-Willy-7b' },
    { id: 'paid-model', prompt: '0.001', completion: '0.002' },
    { id: 'zero-price', prompt: 0, completion: 0 },
    { id: 'x/y:model-a:free' },
    { id: '' },
  ]))
  check('Filter model gratis + dedup', JSON.stringify(free) === JSON.stringify(['x/y:model-a:free', 'Free-Willy-7b', 'zero-price']), free.join(','))

  check('Filter non-JSON aman', filterFreeModels(null).length === 0 && filterFreeModels({}).length === 0 && filterFreeModels({ data: 'x' }).length === 0)

  const tierFreeBody = { data: [{ id: 'llama-3.1-8b-instant' }, { id: 'mixtral-8x7b-32768' }] }
  check('Daftar semua id model', JSON.stringify(listAllModelIds(tierFreeBody)) === JSON.stringify(['llama-3.1-8b-instant', 'mixtral-8x7b-32768']))

  const tierFreeFetch = mockFetch([{ match: isModels, respond: () => jsonResponse(tierFreeBody) }])
  const tierFree = await fetchFreeModels('https://api.groq.com/openai/v1', 'gsk-x', tierFreeFetch, 2000, silent, 'Groq-01')
  check('Fallback tier gratis tanpa label', JSON.stringify(tierFree) === JSON.stringify(['llama-3.1-8b-instant', 'mixtral-8x7b-32768']), tierFree.join(','))

  const mixedBody = { data: [{ id: 'm/good:free', pricing: { prompt: 0, completion: 0 } }, { id: 'paid-x', pricing: { prompt: 1, completion: 1 } }] }
  const mixedFetch = mockFetch([{ match: isModels, respond: () => jsonResponse(mixedBody) }])
  const mixed = await fetchFreeModels('https://openrouter.ai/api/v1', 'sk-or-x', mixedFetch, 2000, silent, 'OpenRouter-01')
  check('Model gratis diprioritaskan', JSON.stringify(mixed) === JSON.stringify(['m/good:free']), mixed.join(','))

  const manyBody = { data: Array.from({ length: 30 }, (_, i) => ({ id: `model-${i}` })) }
  const manyFetch = mockFetch([{ match: isModels, respond: () => jsonResponse(manyBody) }])
  const capped = await fetchFreeModels('https://api.groq.com/openai/v1', 'gsk-x', manyFetch, 2000, silent, 'Groq-01', 5)
  check('Batas model per provider', capped.length === 5 && capped[0] === 'model-0')

  const timeoutFetch = mockFetch([{ match: () => true, respond: () => new Promise(() => undefined) }])
  const timeoutModels = await fetchFreeModels('https://a.example/v1', 'k', timeoutFetch, 50, silent, 'Provider-01')
  check('Timeout model fetch', timeoutModels.length === 0)

  const deniedFetch = mockFetch([{ match: isModels, respond: () => jsonResponse({}, 401) }])
  const denied = await fetchFreeModels('https://a.example/v1', 'bad', deniedFetch, 2000, silent, 'Provider-01')
  check('401 model fetch', denied.length === 0)

  check('Sanitasi buang HTML', sanitizeText('<script>alert(1)</script><b>halo</b>', 100) === 'alert(1) halo')

  let parsed: unknown = null
  try {
    parsed = extractJson('```json\n{"a": 1}\n```')
  } catch {
    parsed = null
  }
  check('Ekstrak JSON dari fence', (parsed as { a?: number } | null)?.a === 1)

  const baseEnv = { AI_BASE_URL_01: 'https://p1.example/v1', AI_API_KEY_01: 'k1', AI_BASE_URL_02: 'https://p2.example/v1', AI_API_KEY_02: 'k2' }

  const okFetch = mockFetch([
    { match: isModels, respond: () => jsonResponse(modelsBody([{ id: 'm/one:free' }])) },
    { match: () => true, respond: () => jsonResponse(chatBody('halo dunia')) },
  ])
  const r1 = await generateWithFallback({ messages: [{ role: 'user', content: 'hai' }] }, { getEnv: envOf(baseEnv), fetchFn: okFetch, logger: silent })
  check('TEST 1 normal flow', r1.content === 'halo dunia' && r1.provider === 'Provider-01' && r1.model === 'm/one:free' && r1.attempts === 1, JSON.stringify(r1))

  const noRetryEnv = { ...baseEnv, AI_MAX_RETRIES: '0' }
  const fallbackModelFetch = mockFetch([
    { match: isModels, respond: () => jsonResponse(modelsBody([{ id: 'm/bad:free' }, { id: 'm/good:free' }])) },
    {
      match: (_u, init) => modelOf(init) === 'm/bad:free',
      respond: () => jsonResponse({ error: 'rate limited' }, 429),
    },
    { match: () => true, respond: () => jsonResponse(chatBody('hasil baik')) },
  ])
  const r2 = await generateWithFallback({ messages: [{ role: 'user', content: 'hai' }] }, { getEnv: envOf(noRetryEnv), fetchFn: fallbackModelFetch, logger: silent })
  check('TEST 2 fallback model', r2.content === 'hasil baik' && r2.model === 'm/good:free' && r2.attempts === 2, JSON.stringify(r2))

  const fallbackProviderFetch = mockFetch([
    {
      match: (u) => u.startsWith('https://p1.example') && isModels(u),
      respond: () => jsonResponse(modelsBody([{ id: 'm/x:free' }])),
    },
    {
      match: (u) => u.startsWith('https://p1.example') && !isModels(u),
      respond: () => jsonResponse({ error: 'down' }, 500),
    },
    {
      match: (u) => u.startsWith('https://p2.example') && isModels(u),
      respond: () => jsonResponse(modelsBody([{ id: 'm/y:free' }])),
    },
    { match: () => true, respond: () => jsonResponse(chatBody('dari provider dua')) },
  ])
  const r3 = await generateWithFallback({ messages: [{ role: 'user', content: 'hai' }] }, { getEnv: envOf(noRetryEnv), fetchFn: fallbackProviderFetch, logger: silent })
  check('TEST 3 fallback provider', r3.content === 'dari provider dua' && r3.provider === 'Provider-02' && r3.providerIndex === 2, JSON.stringify(r3))

  const allFailFetch = mockFetch([{ match: () => true, respond: () => jsonResponse({ error: 'boom' }, 503) }])
  let allFailMessage = ''
  try {
    await generateWithFallback({ messages: [{ role: 'user', content: 'hai' }] }, { getEnv: envOf(baseEnv), fetchFn: allFailFetch, logger: silent })
  } catch (e) {
    allFailMessage = e instanceof Error ? e.message : String(e)
  }
  check('TEST 4 semua gagal informatif', allFailMessage.includes('Semua provider AI gagal') && !allFailMessage.includes('k1') && !allFailMessage.includes('k2'), allFailMessage.slice(0, 120))

  const dynamicFetch = mockFetch([
    { match: isModels, respond: () => jsonResponse(modelsBody([{ id: 'm/z:free' }])) },
    { match: () => true, respond: () => jsonResponse({ error: 'down' }, 500) },
  ])
  const dynamicEnv: Record<string, string> = { ...baseEnv, AI_MAX_RETRIES: '0' }
  const seenBefore: number[] = []
  await generateWithFallback(
    {
      messages: [{ role: 'user', content: 'hai' }],
      onProviderChange: (info) => {
        seenBefore.push(info.index)
      },
    },
    { getEnv: envOf(dynamicEnv), fetchFn: dynamicFetch, logger: silent },
  ).catch(() => null)
  dynamicEnv['AI_BASE_URL_03'] = 'https://p3.example/v1'
  dynamicEnv['AI_API_KEY_03'] = 'k3'
  const seenAfter: number[] = []
  await generateWithFallback(
    {
      messages: [{ role: 'user', content: 'hai' }],
      onProviderChange: (info) => {
        seenAfter.push(info.index)
      },
    },
    { getEnv: envOf(dynamicEnv), fetchFn: dynamicFetch, logger: silent },
  ).catch(() => null)
  check('TEST 5 env dinamis tanpa restart', seenBefore.join(',') === '1,2' && seenAfter.join(',') === '1,2,3', `${seenBefore.join(',')} -> ${seenAfter.join(',')}`)

  const qFetch = mockFetch([
    { match: isModels, respond: () => jsonResponse(modelsBody([{ id: 'm/q:free' }])) },
    {
      match: () => true,
      respond: () =>
        jsonResponse(
          chatBody(
            JSON.stringify([
              { type: 'multiple_choice', question: 'Ibu kota Indonesia?', options: ['Jakarta', 'Surabaya', 'Medan', 'Makassar'], correctAnswer: 'A', explanation: 'Jakarta ibu kota.', difficulty: 'easy' },
              { type: 'benar-salah', question: 'x', options: null, correctAnswer: '', explanation: '', difficulty: 'easy' },
            ]),
          ),
        ),
    },
  ])
  const questions = await generateQuestions(
    (messages, maxTokens, temperature) =>
      generateWithFallback({ messages, maxTokens, temperature }, { getEnv: envOf(baseEnv), fetchFn: qFetch, logger: silent }).then((r) => r.content),
    'Ibu kota',
    { count: 5 },
  )
  check('TEST 6 generate soal tervalidasi', questions.length === 1 && questions[0].type === 'multiple_choice' && (questions[0].options?.length ?? 0) === 4, JSON.stringify(questions).slice(0, 160))

  const gFetch = mockFetch([
    { match: isModels, respond: () => jsonResponse(modelsBody([{ id: 'm/g:free' }])) },
    { match: () => true, respond: () => jsonResponse(chatBody(JSON.stringify({ score: 85, feedback: 'Bagus <b>sekali</b>', correctAnswer: 'Fotosintesis', improvement: 'Tambah detail.' }))) },
  ])
  const grade = await gradeEssay(
    (messages, maxTokens, temperature) =>
      generateWithFallback({ messages, maxTokens, temperature }, { getEnv: envOf(baseEnv), fetchFn: gFetch, logger: silent }).then((r) => r.content),
    'Jelaskan fotosintesis',
    'Proses tumbuhan membuat makanan',
    {},
  )
  check('TEST 7 grading essay', grade.score === 85 && grade.feedback === 'Bagus sekali' && grade.improvement !== '', JSON.stringify(grade).slice(0, 160))

  const noKeyFetch = mockFetch([
    {
      match: (u) => u.startsWith('https://p2.example') && isModels(u),
      respond: () => jsonResponse(modelsBody([{ id: 'm/ok:free' }])) },
    { match: () => true, respond: () => jsonResponse(chatBody('lewat provider dua')) },
  ])
  const r8 = await generateWithFallback(
    { messages: [{ role: 'user', content: 'hai' }] },
    { getEnv: envOf({ AI_BASE_URL_01: 'https://p1.example/v1', AI_BASE_URL_02: 'https://p2.example/v1', AI_API_KEY_02: 'k2' }), fetchFn: noKeyFetch, logger: silent },
  )
  check('TEST 8 kunci hilang pakai provider 02', r8.provider === 'Provider-02' && r8.content === 'lewat provider dua', JSON.stringify(r8))

  const tierFetch = mockFetch([
    { match: isModels, respond: () => jsonResponse({ data: [{ id: 'llama-3.1-8b-instant' }] }) },
    { match: () => true, respond: () => jsonResponse(chatBody('dari tier gratis')) },
  ])
  const r9 = await generateWithFallback(
    { messages: [{ role: 'user', content: 'hai' }] },
    { getEnv: envOf({ AI_BASE_URL_01: 'https://api.groq.com/openai/v1', AI_API_KEY_01: 'gsk-x' }), fetchFn: tierFetch, logger: silent },
  )
  check('TEST 9 provider tier gratis tanpa label', r9.content === 'dari tier gratis' && r9.model === 'llama-3.1-8b-instant' && r9.provider === 'Groq-01', JSON.stringify(r9))

  const notesPrompt = buildGeneratePrompt('Fotosintesis', { count: 5, notes: 'pakai bahasa sederhana' })[0].content
  check('Instruksi tambahan masuk prompt', notesPrompt.includes('pakai bahasa sederhana'))

  const multiPrompt = buildGeneratePrompt('Gravitasi', { count: 6, type: ['multiple_choice', 'essay'] })[0].content
  check('Multi jenis soal masuk prompt', multiPrompt.includes('multiple_choice, essay') && multiPrompt.includes('Variasikan'))

  const refineFetch = mockFetch([
    { match: isModels, respond: () => jsonResponse(modelsBody([{ id: 'm/r:free' }])) },
    {
      match: () => true,
      respond: () =>
        jsonResponse(
          chatBody(
            JSON.stringify([
              { type: 'multiple_choice', question: 'Ibu kota Indonesia?', options: ['Jakarta', 'Bandung', 'Medan', 'Surabaya'], correctAnswer: 'A', explanation: 'Jakarta ibu kota.', difficulty: 'hard', topic: 'Ibu kota' },
            ]),
          ),
        ),
    },
  ])
  const refined = await refineQuestions(
    (messages, maxTokens, temperature) =>
      generateWithFallback({ messages, maxTokens, temperature }, { getEnv: envOf(baseEnv), fetchFn: refineFetch, logger: silent }).then((r) => r.content),
    [{ type: 'multiple_choice', question: 'Ibu kota Indonesia?', options: ['Jakarta', 'Surabaya'], correctAnswer: 'A', explanation: '', difficulty: 'easy', topic: 'Ibu kota' }],
    'tambah 2 opsi pengecoh dan naikkan kesulitan',
    {},
  )
  check('TEST 10 revisi soal via AI', refined.length === 1 && refined[0].difficulty === 'hard' && (refined[0].options?.length ?? 0) === 4, JSON.stringify(refined).slice(0, 160))

  let refineEmpty = ''
  try {
    await refineQuestions(() => Promise.resolve('[]'), [], 'ubah', {})
  } catch (e) {
    refineEmpty = e instanceof Error ? e.message : String(e)
  }
  check('Revisi tanpa soal ditolak', refineEmpty.includes('Belum ada soal'))

  const explain = await generateExplanation(
    (messages, maxTokens, temperature) =>
      generateWithFallback({ messages, maxTokens, temperature }, { getEnv: envOf(baseEnv), fetchFn: qFetch, logger: silent }).then((r) => r.content),
    'Ibu kota Indonesia?',
    ['Jakarta', 'Surabaya'],
    'A',
    'multiple_choice',
    {},
  ).catch(() => null)
  check('Fitur pembahasan', explain === null || typeof explain.explanation === 'string')

  const analysis = await analyzeResult(
    () =>
      Promise.reject(new Error('AI mati')),
    { examTitle: 'UTS', rows: [{ score: 80, passed: true }, { score: 60, passed: false }] },
    10,
  )
  check('Analisis fallback tanpa AI', analysis.overallScore === 70 && analysis.correctCount === 1 && analysis.totalQuestions === 10 && analysis.summary !== '')

  console.log(`\nRingkasan: ${passed} lolos, ${failed} gagal`)
  if (failed > 0) {
    console.log(`Gagal: ${failures.join(', ')}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
