import type { ChatMessage } from './client-factory.ts'

export type GenerateFn = (messages: ChatMessage[], maxTokens: number, temperature: number) => Promise<string>

export type QuestionType = 'multiple_choice' | 'true_false' | 'short_answer' | 'essay'
export type Difficulty = 'easy' | 'medium' | 'hard'

export interface GeneratedQuestion {
  type: QuestionType
  question: string
  options: string[] | null
  correctAnswer: string
  explanation: string
  difficulty: Difficulty
  topic: string
}

export interface GradeResult {
  score: number
  feedback: string
  correctAnswer: string
  improvement: string
}

export interface AnalysisInput {
  examTitle: string
  studentName?: string
  rows: { score: number; passed: boolean | null }[]
}

export interface AnalysisResult {
  overallScore: number
  totalQuestions: number
  correctCount: number
  weakTopics: string[]
  strongTopics: string[]
  recommendations: string[]
  summary: string
}

export interface ExplanationResult {
  explanation: string
  wrongAnswerAnalysis: Record<string, string> | null
  additionalContext: string
  studyTips: string[]
}

const JSON_INSTRUCTION = 'Return ONLY valid JSON, no markdown, no explanation outside JSON.'

export function sanitizeText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return ''
  const stripped = value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return stripped.length > maxLength ? `${stripped.slice(0, maxLength)}…` : stripped
}

export function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim()
  const start = cleaned.search(/[{[]/)
  if (start < 0) throw new Error('Respons AI tidak mengandung JSON.')
  const tail = cleaned.slice(start)
  const parsed = tryParseTail(tail)
  if (parsed !== undefined) return parsed
  throw new Error('Respons AI bukan JSON valid.')
}

function tryParseTail(tail: string): unknown {
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = 0; i < tail.length; i++) {
    const ch = tail[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{' || ch === '[') depth++
    else if (ch === '}' || ch === ']') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(tail.slice(0, i + 1))
        } catch {
          return undefined
        }
      }
    }
  }
  return undefined
}

function asDifficulty(value: unknown, fallback: Difficulty): Difficulty {
  return value === 'easy' || value === 'medium' || value === 'hard' ? value : fallback
}

function asType(value: unknown, fallback: QuestionType): QuestionType {
  if (value === 'multiple_choice' || value === 'true_false' || value === 'short_answer' || value === 'essay') return value
  return fallback
}

export function validateQuestion(raw: unknown, topic: string, fallbackType: QuestionType, fallbackDifficulty: Difficulty): GeneratedQuestion | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const question = sanitizeText(row['question'], 2000)
  if (question.length < 5) return null
  const type = asType(row['type'], fallbackType)
  const correctAnswer = sanitizeText(row['correctAnswer'], 500)
  if (type !== 'essay' && correctAnswer === '') return null
  let options: string[] | null = null
  if (type === 'multiple_choice') {
    if (!Array.isArray(row['options'])) return null
    options = (row['options'] as unknown[]).map((o) => sanitizeText(o, 500)).filter((o) => o !== '')
    if (options.length < 2) return null
  }
  return {
    type,
    question,
    options,
    correctAnswer,
    explanation: sanitizeText(row['explanation'], 2000),
    difficulty: asDifficulty(row['difficulty'], fallbackDifficulty),
    topic,
  }
}

export interface GenerateQuestionsOptions {
  count?: number
  type?: QuestionType | 'mixed' | QuestionType[]
  difficulty?: Difficulty | 'mixed'
  language?: 'id' | 'en'
  notes?: string
}

export function buildGeneratePrompt(topic: string, options: GenerateQuestionsOptions): ChatMessage[] {
  const count = Math.min(Math.max(options.count ?? 10, 1), 20)
  const normalizedType = Array.isArray(options.type) && options.type.length === 0 ? 'mixed' : (options.type ?? 'mixed')
  const typeValue = normalizedType
  const typeText = Array.isArray(typeValue) ? typeValue.join(', ') : typeValue
  const variety = Array.isArray(typeValue) && typeValue.length > 1
    ? ((options.language ?? 'id') === 'id' ? ' Variasikan soal di antara jenis-jenis tersebut.' : ' Vary questions across those types.')
    : ''
  const difficulty = options.difficulty ?? 'mixed'
  const id = (options.language ?? 'id') === 'id'
  const schema = '{"type":"multiple_choice|true_false|short_answer|essay","question":"...","options":["..."],"correctAnswer":"...","explanation":"...","difficulty":"easy|medium|hard"}'
  const extra = options.notes !== undefined && options.notes.trim() !== ''
    ? (id ? ` Instruksi tambahan dari guru: """${options.notes.trim().slice(0, 1500)}"""` : ` Additional teacher instructions: """${options.notes.trim().slice(0, 1500)}"""`)
    : ''
  const content = id
    ? `Buatkan ${count} soal ujian bertopik "${topic}". Jenis: ${typeText}.${variety} Tingkat kesulitan: ${difficulty}. Bahasa Indonesia. Untuk multiple_choice sertakan 4 opsi dan correctAnswer berupa huruf (A/B/C/D). Untuk true_false correctAnswer wajib "Benar" atau "Salah". Untuk short_answer correctAnswer berisi jawaban dipisah ";". Untuk essay correctAnswer boleh kosong dan isi explanation sebagai rubrik.${extra} Kembalikan array JSON dengan skema tiap item: ${schema}. ${JSON_INSTRUCTION}`
    : `Create ${count} exam questions about "${topic}". Type: ${typeText}.${variety} Difficulty: ${difficulty}.${extra} Each item schema: ${schema}. ${JSON_INSTRUCTION}`
  return [{ role: 'user', content }]
}

export async function generateQuestions(generate: GenerateFn, topic: string, options: GenerateQuestionsOptions): Promise<GeneratedQuestion[]> {
  const cleanTopic = topic.trim()
  if (cleanTopic.length < 3) throw new Error('Topik minimal 3 karakter.')
  const count = Math.min(Math.max(options.count ?? 10, 1), 20)
  const rawType = options.type ?? 'mixed'
  const fallbackType = Array.isArray(rawType) ? (rawType[0] ?? 'multiple_choice') : rawType === 'mixed' ? 'multiple_choice' : rawType
  const fallbackDifficulty = options.difficulty === 'mixed' || !options.difficulty ? 'medium' : options.difficulty
  let lastError: unknown = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = extractJson(await generate(buildGeneratePrompt(cleanTopic, options), 4000, 0.7))
      const list = Array.isArray(raw) ? raw : [raw]
      const valid = list
        .map((item) => validateQuestion(item, cleanTopic, fallbackType, fallbackDifficulty))
        .filter((q): q is GeneratedQuestion => q !== null)
        .slice(0, count)
      if (valid.length > 0) return valid
      lastError = new Error('AI tidak menghasilkan soal yang valid.')
    } catch (err) {
      lastError = err
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Gagal membuat soal.')
}

export interface GradeEssayOptions {
  maxScore?: number
  rubric?: string
  language?: 'id' | 'en'
}

export function buildGradePrompt(questionText: string, answerText: string, options: GradeEssayOptions): ChatMessage[] {
  const max = Math.min(Math.max(options.maxScore ?? 100, 1), 100)
  const id = (options.language ?? 'id') === 'id'
  const rubric = options.rubric && options.rubric.trim() !== '' ? options.rubric.trim().slice(0, 1500) : 'kelengkapan argumen, ketepatan konsep, dan keruntutan penjelasan'
  const content = id
    ? `Nilai jawaban essay berikut skala 0-${max}. Soal: """${questionText.slice(0, 2000)}""" Jawaban siswa: """${answerText.slice(0, 4000)}""" Rubrik: ${rubric}. Kembalikan JSON {"score":0-${max},"feedback":"...","correctAnswer":"...","improvement":"..."}. ${JSON_INSTRUCTION}`
    : `Grade this essay answer on a 0-${max} scale. Question: """${questionText.slice(0, 2000)}""" Answer: """${answerText.slice(0, 4000)}""" Return JSON {"score":0-${max},"feedback":"...","correctAnswer":"...","improvement":"..."}. ${JSON_INSTRUCTION}`
  return [{ role: 'user', content }]
}

export function validateGrade(raw: unknown, maxScore: number): GradeResult | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const score = Number(row['score'])
  if (!Number.isFinite(score)) return null
  return {
    score: Math.min(Math.max(Math.round(score), 0), maxScore),
    feedback: sanitizeText(row['feedback'], 2000),
    correctAnswer: sanitizeText(row['correctAnswer'], 1000),
    improvement: sanitizeText(row['improvement'], 1000),
  }
}

export async function gradeEssay(generate: GenerateFn, questionText: string, answerText: string, options: GradeEssayOptions): Promise<GradeResult> {
  if (questionText.trim() === '' || answerText.trim() === '') throw new Error('Soal dan jawaban wajib diisi.')
  const max = Math.min(Math.max(options.maxScore ?? 100, 1), 100)
  let lastError: unknown = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = validateGrade(extractJson(await generate(buildGradePrompt(questionText, answerText, options), 1500, 0.3)), max)
      if (result) return result
      lastError = new Error('Penilaian AI tidak valid.')
    } catch (err) {
      lastError = err
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Gagal menilai essay.')
}

export function computeAnalysis(rows: { score: number; passed: boolean | null }[]): { overallScore: number; correctCount: number } {
  const scores = rows.map((r) => (Number.isFinite(Number(r.score)) ? Number(r.score) : 0))
  const overallScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
  return { overallScore, correctCount: rows.filter((r) => r.passed === true).length }
}

export function buildAnalyzePrompt(input: AnalysisInput): ChatMessage[] {
  const id = true
  const sample = input.rows.slice(0, 60).map((r) => Number(r.score ?? 0).toFixed(1)).join(', ')
  const content = id
    ? `Analisis hasil ujian "${input.examTitle.slice(0, 200)}" (${input.rows.length} peserta, nilai: ${sample}). Kembalikan JSON {"weakTopics":["..."],"strongTopics":["..."],"recommendations":["..."],"summary":"..."}. Bahasa Indonesia. ${JSON_INSTRUCTION}`
    : `Analyze exam results. Return JSON {"weakTopics":[],"strongTopics":[],"recommendations":[],"summary":""}. ${JSON_INSTRUCTION}`
  void input.studentName
  return [{ role: 'user', content }]
}

export function validateAnalysis(raw: unknown): Omit<AnalysisResult, 'overallScore' | 'totalQuestions' | 'correctCount'> | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const list = (value: unknown): string[] =>
    Array.isArray(value) ? value.map((v) => sanitizeText(v, 300)).filter((v) => v !== '').slice(0, 8) : []
  const summary = sanitizeText(row['summary'], 1500)
  if (summary === '') return null
  return {
    weakTopics: list(row['weakTopics']),
    strongTopics: list(row['strongTopics']),
    recommendations: list(row['recommendations']),
    summary,
  }
}

function fallbackAnalysis(): Omit<AnalysisResult, 'overallScore' | 'totalQuestions' | 'correctCount'> {
  return {
    weakTopics: [],
    strongTopics: [],
    recommendations: ['Perbanyak latihan soal pada materi dengan nilai terendah.'],
    summary: 'Ringkasan otomatis AI tidak tersedia saat ini. Nilai dihitung dari hasil ujian yang terkumpul.',
  }
}

export async function analyzeResult(
  generate: GenerateFn,
  input: AnalysisInput,
  totalQuestions: number,
): Promise<AnalysisResult> {
  if (input.rows.length === 0) throw new Error('Belum ada data hasil untuk dianalisis.')
  const computed = computeAnalysis(input.rows)
  try {
    const parsed = validateAnalysis(extractJson(await generate(buildAnalyzePrompt(input), 1200, 0.5)))
    const narrative = parsed ?? fallbackAnalysis()
    return { ...narrative, overallScore: computed.overallScore, totalQuestions, correctCount: computed.correctCount }
  } catch {
    return { ...fallbackAnalysis(), overallScore: computed.overallScore, totalQuestions, correctCount: computed.correctCount }
  }
}

export interface ExplainOptions {
  depth?: 'brief' | 'detailed'
  language?: 'id' | 'en'
}

export function buildExplainPrompt(questionText: string, optionsText: string[], correctAnswer: string, type: string, options: ExplainOptions): ChatMessage[] {
  const id = (options.language ?? 'id') === 'id'
  const depth = options.depth === 'detailed' ? (id ? 'mendalam' : 'detailed') : (id ? 'ringkas' : 'brief')
  const content = id
    ? `Buatkan pembahasan ${depth} untuk soal: """${questionText.slice(0, 2000)}""" ${optionsText.length > 0 ? `Opsi: ${optionsText.slice(0, 6).join(' | ').slice(0, 1500)}.` : ''} Kunci jawaban: ${correctAnswer.slice(0, 300) || '-'}. Jenis: ${type}. Kembalikan JSON {"explanation":"...","wrongAnswerAnalysis":{"opsi":"alasan"} atau null,"additionalContext":"...","studyTips":["..."]}. ${JSON_INSTRUCTION}`
    : `Explain this question briefly. Return JSON {"explanation":"...","wrongAnswerAnalysis":null,"additionalContext":"...","studyTips":[]}. ${JSON_INSTRUCTION}`
  return [{ role: 'user', content }]
}

export function validateExplanation(raw: unknown): ExplanationResult | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const explanation = sanitizeText(row['explanation'], 2500)
  if (explanation === '') return null
  let wrong: Record<string, string> | null = null
  if (row['wrongAnswerAnalysis'] && typeof row['wrongAnswerAnalysis'] === 'object' && !Array.isArray(row['wrongAnswerAnalysis'])) {
    const entries = Object.entries(row['wrongAnswerAnalysis'] as Record<string, unknown>)
      .map(([k, v]) => [sanitizeText(k, 120), sanitizeText(v, 500)] as const)
      .filter(([, v]) => v !== '')
      .slice(0, 8)
    if (entries.length > 0) wrong = Object.fromEntries(entries)
  }
  const tips = Array.isArray(row['studyTips']) ? row['studyTips'].map((t) => sanitizeText(t, 300)).filter((t) => t !== '').slice(0, 6) : []
  return {
    explanation,
    wrongAnswerAnalysis: wrong,
    additionalContext: sanitizeText(row['additionalContext'], 1000),
    studyTips: tips,
  }
}

export interface RefineQuestionsOptions {
  language?: 'id' | 'en'
}

export function buildRefinePrompt(current: GeneratedQuestion[], instruction: string, options: RefineQuestionsOptions): ChatMessage[] {
  const id = (options.language ?? 'id') === 'id'
  const schema = '{"type":"multiple_choice|true_false|short_answer|essay","question":"...","options":["..."],"correctAnswer":"...","explanation":"...","difficulty":"easy|medium|hard","topic":"..."}'
  const snapshot = JSON.stringify(current).slice(0, 12000)
  const content = id
    ? `Kamu membantu guru menyunting daftar soal ujian berikut: ${snapshot} Perintah guru: """${instruction.slice(0, 2000)}""" Terapkan perintah (ubah, tambah, atau hapus soal sesuai perintah) lalu kembalikan SELURUH daftar soal hasil suntingan sebagai array JSON dengan skema tiap item: ${schema}. Bahasa Indonesia. ${JSON_INSTRUCTION}`
    : `Help a teacher edit this exam question list: ${snapshot} Teacher instruction: """${instruction.slice(0, 2000)}""" Apply it then return the FULL edited list as a JSON array, each item schema: ${schema}. ${JSON_INSTRUCTION}`
  return [{ role: 'user', content }]
}

export async function refineQuestions(
  generate: GenerateFn,
  current: GeneratedQuestion[],
  instruction: string,
  options: RefineQuestionsOptions,
): Promise<GeneratedQuestion[]> {
  const cleanInstruction = instruction.trim()
  if (current.length === 0) throw new Error('Belum ada soal untuk disunting.')
  if (cleanInstruction.length < 3) throw new Error('Perintah revisi minimal 3 karakter.')
  if (current.length > 20) throw new Error('Maksimal 20 soal per revisi.')
  let lastError: unknown = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = extractJson(await generate(buildRefinePrompt(current, cleanInstruction, options), 4000, 0.5))
      const list = Array.isArray(raw) ? raw : [raw]
      const valid = list
        .map((item) => {
          const row = (item ?? {}) as Record<string, unknown>
          const origin = current.find((q) => q.question === sanitizeText(row['question'], 2000)) ?? current[0]
          const fallbackTopic = origin.topic || 'Umum'
          return validateQuestion(item, fallbackTopic, asType(row['type'], origin.type), asDifficulty(row['difficulty'], origin.difficulty))
        })
        .filter((q): q is GeneratedQuestion => q !== null)
        .slice(0, 20)
      if (valid.length > 0) return valid
      lastError = new Error('AI tidak menghasilkan revisi yang valid.')
    } catch (err) {
      lastError = err
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Gagal menyunting soal.')
}

export async function generateExplanation(
  generate: GenerateFn,
  questionText: string,
  optionsText: string[],
  correctAnswer: string,
  type: string,
  options: ExplainOptions,
): Promise<ExplanationResult> {
  if (questionText.trim().length < 5) throw new Error('Teks soal minimal 5 karakter.')
  let lastError: unknown = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = validateExplanation(extractJson(await generate(buildExplainPrompt(questionText, optionsText, correctAnswer, type, options), 1500, 0.5)))
      if (result) return result
      lastError = new Error('Pembahasan AI tidak valid.')
    } catch (err) {
      lastError = err
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Gagal membuat pembahasan.')
}
