import { invokeEdge, EdgeInvokeError } from './client'
import { buildExplanationDraft, buildExamRecap, suggestEssayScore } from './local-assist.service'
import type { Difficulty, QuestionType } from '@/types/models'
import type {
  AiFeature,
  GeneratedQuestion,
  EssayGradeResult,
  ExamAnalysisResult,
  AiMessage,
  KeyConcept,
} from './ai-providers/interface'

export type VeyraAiErrorKind = 'unavailable' | 'quota' | 'forbidden' | 'server' | 'network'

export class VeyraAiError extends Error {
  readonly kind: VeyraAiErrorKind
  constructor(kind: VeyraAiErrorKind, message: string) {
    super(message)
    this.name = 'VeyraAiError'
    this.kind = kind
  }
}

export interface VeyraGenerateInput {
  subject: string
  gradeLevel: string
  material: string
  count: number
  type: QuestionType | 'mixed'
  difficulty: Difficulty | 'mixed'
}

export interface VeyraImproveInput {
  questionText: string
  type: QuestionType
  optionsText?: string[]
  correctAnswer?: string
  explanation?: string
  currentDifficulty?: Difficulty
}

export interface VeyraAnalysisInput {
  examTitle: string
  scores: number[]
  passingGrade: number
  distribution?: { label: string; count: number }[]
  lowQuestions?: { text: string; answered: number; attemptedBy: number }[]
}

const QUESTION_TYPES: QuestionType[] = ['multiple_choice', 'multiple_response', 'true_false', 'matching', 'short_answer', 'essay']
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']
const COGNITIVE_LEVELS = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6']

function toVeyraError(err: unknown): VeyraAiError {
  if (err instanceof VeyraAiError) return err
  if (err instanceof EdgeInvokeError) {
    const msg = err.message.toLowerCase()
    if (err.status === 503 || msg.includes('belum dikonfigurasi') || err.kind === 'not_deployed' || err.kind === 'cors_or_network') {
      return new VeyraAiError('unavailable', 'Layanan Veyra AI di server belum aktif. Admin perlu deploy Edge Function "ai-proxy" dan mengisi AI_BASE_URL, AI_API_KEY, serta AI_MODEL di secrets server. Fitur lokal tetap dapat dipakai.')
    }
    if (err.status === 429 || msg.includes('kuota')) {
      return new VeyraAiError('quota', 'Kuota Veyra AI telah habis. Coba lagi nanti atau hubungi admin.')
    }
    if (err.status === 403) {
      return new VeyraAiError('forbidden', 'Fitur Veyra AI hanya untuk guru dan admin.')
    }
    return new VeyraAiError('server', err.message || 'Veyra AI gagal memproses permintaan. Coba lagi.')
  }
  if (err instanceof DOMException && err.name === 'AbortError') {
    return new VeyraAiError('network', 'Waktu permintaan habis. Periksa koneksi internet lalu coba lagi.')
  }
  return new VeyraAiError('server', err instanceof Error ? err.message : 'Veyra AI gagal memproses permintaan. Coba lagi.')
}

async function chat(feature: AiFeature, messages: AiMessage[], maxTokens: number, retryCount = 1): Promise<string> {
  try {
    const result = await invokeEdge<{ ok: boolean; content: string }>(
      'ai-proxy',
      { feature, messages, maxTokens, temperature: 0.7 },
      { timeoutMs: 70000 },
    )
    if (!result.content?.trim()) throw new VeyraAiError('server', 'AI mengembalikan respons kosong. Coba lagi.')
    return result.content.trim()
  } catch (err) {
    if (retryCount > 0 && (err instanceof EdgeInvokeError || err instanceof VeyraAiError)) {
      await new Promise((r) => setTimeout(r, 1500))
      return chat(feature, messages, maxTokens, retryCount - 1)
    }
    throw toVeyraError(err)
  }
}

function extractJsonArray(text: string): unknown[] {
  const direct = (() => { try { return JSON.parse(text) as unknown } catch { return null } })()
  if (Array.isArray(direct)) return direct
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced?.[1] ?? text).trim()
  const start = candidate.indexOf('[')
  const end = candidate.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) throw new VeyraAiError('server', 'AI mengembalikan format yang tidak valid. Coba lagi.')
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as unknown
    if (!Array.isArray(parsed)) throw new Error('bukan array')
    return parsed
  } catch {
    throw new VeyraAiError('server', 'AI mengembalikan format yang tidak valid. Coba lagi.')
  }
}

function extractJsonObject(text: string): Record<string, unknown> {
  const direct = (() => { try { return JSON.parse(text) as Record<string, unknown> } catch { return null } })()
  if (direct && Object.keys(direct).length > 0) return direct
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced?.[1] ?? text).trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1) throw new VeyraAiError('server', 'AI mengembalikan format yang tidak valid. Coba lagi.')
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>
    if (typeof parsed !== 'object' || parsed === null) throw new Error('bukan object')
    return parsed
  } catch {
    throw new VeyraAiError('server', 'AI mengembalikan format yang tidak valid. Coba lagi.')
  }
}

function normalizeQuestion(raw: Record<string, unknown>, fallbackTopic: string): GeneratedQuestion | null {
  const type = String(raw.type ?? '')
  if (!QUESTION_TYPES.includes(type as QuestionType)) return null
  const question = String(raw.question ?? '').trim()
  if (question.length < 5) return null
  const difficulty = DIFFICULTIES.includes(String(raw.difficulty) as Difficulty) ? (String(raw.difficulty) as Difficulty) : 'medium'
  const options = Array.isArray(raw.options)
    ? raw.options.map((o) => String(o)).map((s) => s.trim()).filter(Boolean).slice(0, 6)
    : null
  const pairs = Array.isArray(raw.pairs)
    ? raw.pairs.map((p) => {
        const obj = p as Record<string, unknown>
        return { left: String(obj.left ?? '').trim(), right: String(obj.right ?? '').trim() }
      }).filter((p) => p.left !== '' && p.right !== '').slice(0, 8)
    : null
  if (type === 'multiple_choice' || type === 'multiple_response') {
    if (!options || options.length < 2) return null
  }
  if (type === 'matching') {
    if (!pairs || pairs.length < 2) return null
  }
  const cognitiveLevel = COGNITIVE_LEVELS.includes(String(raw.cognitiveLevel ?? ''))
    ? (String(raw.cognitiveLevel) as 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6')
    : undefined
  return {
    type: type as QuestionType,
    question,
    options,
    pairs,
    correctAnswer: String(raw.correctAnswer ?? '').trim(),
    explanation: String(raw.explanation ?? '').trim(),
    difficulty,
    topic: String(raw.topic ?? fallbackTopic).trim() || fallbackTopic,
    cognitiveLevel,
  }
}

export async function veyraGenerateQuestions(input: VeyraGenerateInput): Promise<GeneratedQuestion[]> {
  const subject = input.subject.trim()
  const material = input.material.trim()
  if (subject === '' || material.length < 10) {
    throw new VeyraAiError('server', 'Isi mata pelajaran dan materi minimal 10 karakter.')
  }
  const count = Math.min(20, Math.max(1, Math.floor(input.count) || 1))
  const system = `Anda adalah asisten pembuat soal kurikulum Indonesia untuk SMK. Jawab HANYA dengan array JSON valid tanpa teks lain. Setiap elemen wajib memiliki: type (multiple_choice/multiple_response/true_false/matching/short_answer/essay), question (soal dalam Bahasa Indonesia), options (array string atau null), pairs (array {left,right} atau null), correctAnswer (string: "A"/"B"/.../ "Benar"/"Salah"/jawaban singkat), explanation (pembahasan singkat dalam Bahasa Indonesia), difficulty (easy/medium/hard), topic (topik materi), cognitiveLevel (opsional: C1-C6 sesuai taksonomi Bloom). Buat soal orisinal, relevan dengan materi, dan hindari pengulangan.`
  const user = `Mata pelajaran: ${subject}\nKelas: ${input.gradeLevel.trim() || '-'}\nMateri:\n${material}\n\nJumlah: ${count} soal\nTipe: ${input.type === 'mixed' ? 'campir semua tipe' : input.type}\nKesulitan: ${input.difficulty === 'mixed' ? 'campir mudah-sedang-sulit' : input.difficulty}\nBahasa: Indonesia`
  const content = await chat('generate-questions', [{ role: 'system', content: system }, { role: 'user', content: user }], 4000)
  const arr = extractJsonArray(content)
  const topic = material.slice(0, 80)
  const normalized: GeneratedQuestion[] = []
  for (const item of arr) {
    if (typeof item !== 'object' || item === null) continue
    const q = normalizeQuestion(item as Record<string, unknown>, topic)
    if (q) normalized.push(q)
    if (normalized.length >= count) break
  }
  if (normalized.length === 0) throw new VeyraAiError('server', 'AI tidak menghasilkan soal yang valid. Coba sederhanakan materi atau periksa kembali konteks.')
  return normalized
}

export async function veyraBuildExplanation(input: {
  questionText: string
  type: string
  optionsText: string[]
  correctAnswer: string
}): Promise<string> {
  const plain = input.questionText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  if (plain.length < 5) throw new VeyraAiError('server', 'Isi teks pertanyaan dulu (min. 5 karakter).')
  try {
    const content = await chat('explain-question', [
      { role: 'system', content: 'Anda adalah guru ahli yang membuat pembahasan soal singkat, jelas, edukatif, dan berbahasa Indonesia. Jawab hanya dengan teks pembahasan maksimal 6 kalimat. Jelaskan mengapa jawaban benar dan mengapa pengecoh salah.' },
      { role: 'user', content: `Soal (${input.type}): ${plain}\nPilihan: ${input.optionsText.join(' | ') || '-'}\nKunci: ${input.correctAnswer || '-'}\nBuatkan pembahasan.` },
    ], 800)
    const trimmed = content.trim()
    if (trimmed.length < 10) throw new Error('kosong')
    return trimmed
  } catch (err) {
    if (err instanceof VeyraAiError && err.kind !== 'unavailable') throw err
    return buildExplanationDraft({
      questionText: plain,
      type: input.type,
      optionsText: input.optionsText,
      correctAnswer: input.correctAnswer,
    })
  }
}

export async function veyraGradeEssay(input: {
  questionText: string
  answerText: string
  maxScore?: number
  rubric?: string
  minWords?: number
}): Promise<EssayGradeResult> {
  const plainQuestion = input.questionText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1000)
  const plainAnswer = input.answerText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 3000)
  const maxScore = input.maxScore ?? 100
  if (plainQuestion.length < 5 || plainAnswer.length < 3) {
    throw new VeyraAiError('server', 'Teks soal dan jawaban terlalu pendek.')
  }
  try {
    const content = await chat('grade-essay', [
      { role: 'system', content: 'Anda adalah guru yang menilai jawaban essay secara objektif sesuai kaidah kurikulum Indonesia. Jawab HANYA dengan JSON: {"score": angka 0-100, "feedback": "ulasan dalam Bahasa Indonesia maksimal 3 kalimat"}.' },
      { role: 'user', content: `Soal: ${plainQuestion}\n\nJawaban siswa: ${plainAnswer}\n\nRubrik: ${input.rubric ?? 'Penilaian standar guru.'}\n\nSkor maksimal: ${maxScore}` },
    ], 600)
    const parsed = extractJsonObject(content)
    const score = typeof parsed.score === 'number' ? Math.max(0, Math.min(maxScore, Math.round(parsed.score))) : null
    const feedback = typeof parsed.feedback === 'string' ? parsed.feedback.trim() : null
    if (score !== null && feedback !== null) {
      const sentences = plainAnswer.split(/[.!?…\n]+/).map((s) => s.trim()).filter(Boolean)
      return { score, feedback, wordCount: plainAnswer.split(/\s+/).length, sentenceCount: sentences.length }
    }
    throw new Error('format salah')
  } catch (err) {
    if (err instanceof VeyraAiError && err.kind === 'unavailable') throw err
    const local = suggestEssayScore({
      questionText: plainQuestion,
      answerText: plainAnswer,
      maxScore,
      rubric: input.rubric?.trim() || undefined,
      minWords: input.minWords,
    })
    return { score: local.score, feedback: local.feedback, wordCount: local.wordCount, sentenceCount: local.sentenceCount }
  }
}

export async function veyraAnalyzeExam(input: VeyraAnalysisInput): Promise<ExamAnalysisResult> {
  const scores = input.scores.filter((n) => Number.isFinite(n) && n >= 0)
  if (scores.length === 0) throw new VeyraAiError('server', 'Masukkan minimal 1 nilai peserta.')
  const localRecap = buildExamRecap({ examTitle: input.examTitle.trim(), scores, passingGrade: input.passingGrade, distribution: input.distribution ?? [], lowQuestions: input.lowQuestions ?? [] })
  try {
    const content = await chat('analyze-exam', [
      { role: 'system', content: 'Anda adalah analis pendidikan yang memberikan ringkasan ujian dalam Bahasa Indonesia. Jawab HANYA dengan JSON: {"summary":"ringkasan 2-3 kalimat","strengths":["poin kekuatan"],"concerns":["poin kekhawatiran"],"recommendations":["rekomendasi konkret"]}. Total skor 0-100.' },
      { role: 'user', content: `Ujian: ${input.examTitle}\nPeserta: ${scores.length}\nKKM: ${input.passingGrade}\nRata-rata: ${localRecap.overallScore}\nRingkasan: ${localRecap.summary}` },
    ], 1000)
    const parsed = extractJsonObject(content)
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : localRecap.summary
    const strengths = Array.isArray(parsed.strengths) ? parsed.strengths.filter((s) => typeof s === 'string').slice(0, 4) : localRecap.strengths
    const concerns = Array.isArray(parsed.concerns) ? parsed.concerns.filter((s) => typeof s === 'string').slice(0, 4) : localRecap.concerns
    const recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations.filter((s) => typeof s === 'string').slice(0, 4) : localRecap.recommendations
    const overallScore = typeof parsed.overallScore === 'number' ? parsed.overallScore : localRecap.overallScore
    return { summary, strengths, concerns, recommendations, overallScore, participantCount: scores.length }
  } catch {
    return localRecap
  }
}

export async function veyraBuildRemedial(input: {
  material: string
  weakPoints?: string
  count: number
}): Promise<string> {
  const material = input.material.trim()
  if (material.length < 10) throw new VeyraAiError('server', 'Isi materi minimal 10 karakter.')
  const count = Math.min(10, Math.max(1, Math.floor(input.count) || 1))
  try {
    const content = await chat('generate-remedial', [
      { role: 'system', content: 'Anda adalah guru yang membuat soal remedial berdasarkan materi dan poin kelemahan. Jawab dengan daftar soal pilihan ganda (A-E) dalam Bahasa Indonesia. Maksimal 6 soal.' },
      { role: 'user', content: `Materi: ${material}\nPoin kelemahan: ${input.weakPoints?.trim() ?? 'umum'}\nJumlah: ${count} soal remedial` },
    ], 1500)
    const trimmed = content.trim()
    if (trimmed.length < 10) throw new Error('kosong')
    return trimmed
  } catch (err) {
    if (err instanceof VeyraAiError && err.kind === 'unavailable') throw err
    return `[Soal Remedial]\nMateri: ${material}\nPoin kelemahan: ${input.weakPoints?.trim() ?? '(umum)'}\nJumlah: ${count} soal.\n\nGuru perlu menyusun soal latihan tambahan sesuai indikator kompetensi yang belum tuntas.`
  }
}

export async function veyraBuildEnrichment(input: {
  material: string
  advanced: boolean
  count: number
}): Promise<string> {
  const material = input.material.trim()
  if (material.length < 10) throw new VeyraAiError('server', 'Isi materi minimal 10 karakter.')
  const count = Math.min(10, Math.max(1, Math.floor(input.count) || 1))
  try {
    const content = await chat('generate-enrichment', [
      { role: 'system', content: 'Anda adalah guru yang membuat soal pengayaan untuk peserta berprestasi. Jawab dengan soal yang menantang dan mendalam dalam Bahasa Indonesia. Maksimal 5 soal.' },
      { role: 'user', content: `Materi: ${material}\nLevel: ${input.advanced ? 'lanjutan (analitis & kreatif)' : 'pengayaan dasar'}\nJumlah: ${count} soal pengayaan` },
    ], 1500)
    const trimmed = content.trim()
    if (trimmed.length < 10) throw new Error('kosong')
    return trimmed
  } catch (err) {
    if (err instanceof VeyraAiError && err.kind === 'unavailable') throw err
    return `[Soal Pengayaan]\nMateri: ${material}\nLevel: ${input.advanced ? 'lanjutan' : 'pengayaan dasar'}\nJumlah: ${count} soal.\n\nSoal pengayaan untuk peserta yang telah mencapai KKM dengan selisih > 15 poin.`
  }
}

export async function veyraImproveQuestion(input: VeyraImproveInput): Promise<GeneratedQuestion> {
  const plain = input.questionText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  if (plain.length < 5) throw new VeyraAiError('server', 'Isi teks pertanyaan dulu (min. 5 karakter).')
  try {
    const content = await chat('improve-question', [
      { role: 'system', content: 'Anda adalah pakar assessment yang memperbaiki soal agar lebih jelas, bebas ambigu, dan sesuai kaidah. Jawab HANYA dengan JSON: {"question":"soal yang diperbaiki","options":null atau array,"pairs":null atau array {left,right},"correctAnswer":"kunci","explanation":"pembahasan singkat","difficulty":"easy/medium/hard","topic":"topik","cognitiveLevel":"C1-C6"}.' },
      { role: 'user', content: `Soal asli: ${plain}\nTipe: ${input.type}\nOpsi: ${input.optionsText?.join(' | ') ?? '-'}\nKunci: ${input.correctAnswer ?? '-'}\nKesulitan saat ini: ${input.currentDifficulty ?? 'sedang'}` },
    ], 1000)
    const parsed = extractJsonObject(content)
    return normalizeQuestion(parsed as Record<string, unknown>, input.questionText.slice(0, 80))!
  } catch {
    throw new VeyraAiError('server', 'Gagal memperbaiki soal. Periksa format soal lalu coba lagi.')
  }
}

export async function veyraExtractKeyConcepts(input: {
  material: string
  subject: string
}): Promise<KeyConcept[]> {
  const material = input.material.trim()
  const subject = input.subject.trim()
  if (material.length < 10) throw new VeyraAiError('server', 'Isi materi minimal 10 karakter.')
  try {
    const content = await chat('extract-key-concepts', [
      { role: 'system', content: 'Anda adalah analis kurikulum yang mengekstrak konsep kunci dari materi. Jawab HANYA dengan JSON array: [{"concept":"nama konsep","description":"penjelasan singkat","indicator":"indikator pencapaian"}]. Maksimal 6 konsep.' },
      { role: 'user', content: `Mata pelajaran: ${subject}\nMateri:\n${material}` },
    ], 1200)
    const arr = extractJsonArray(content)
    return arr
      .filter((item) => typeof item === 'object' && item !== null)
      .map((item) => {
        const obj = item as Record<string, unknown>
        return {
          concept: String(obj.concept ?? '').trim(),
          description: String(obj.description ?? '').trim(),
          indicator: String(obj.indicator ?? '').trim(),
        }
      })
      .filter((c) => c.concept.length > 0 && c.description.length > 0)
      .slice(0, 6)
  } catch {
    throw new VeyraAiError('server', 'Gagal mengekstrak konsep. Periksa format materi lalu coba lagi.')
  }
}

export async function veyraMatchCognitiveLevel(input: {
  questionText: string
  type: QuestionType
  currentLevel?: 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6'
}): Promise<{ level: 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6'; reasoning: string }> {
  const plain = input.questionText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  if (plain.length < 5) throw new VeyraAiError('server', 'Isi teks pertanyaan dulu.')
  try {
    const content = await chat('match-cognitive-level', [
      { role: 'system', content: 'Anda adalah analis taksonomi Bloom. Tentukan level kognitif soal. Jawab HANYA dengan JSON: {"level":"C1/C2/C3/C4/C5/C6","reasoning":"alasan 1-2 kalimat"}.' },
      { role: 'user', content: `Soal: ${plain}\nTipe: ${input.type}\nLevel saat ini: ${input.currentLevel ?? '(belum ditentukan)'}` },
    ], 400)
    const parsed = extractJsonObject(content)
    const level = (parsed.level as string)?.toUpperCase()
    const validLevel = COGNITIVE_LEVELS.includes(level)
      ? (level as 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6')
      : 'C2'
    return { level: validLevel, reasoning: String(parsed.reasoning ?? 'Analisis otomatis').trim() }
  } catch {
    return { level: input.currentLevel ?? 'C2', reasoning: 'Penentuan level menggunakan heuristic lokal.' }
  }
}
