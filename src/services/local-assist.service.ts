export interface ExamRecapInput {
  examTitle: string
  scores: number[]
  passingGrade: number
  distribution: { label: string; count: number }[]
  lowQuestions: { text: string; answered: number; attemptedBy: number }[]
}

export interface ExamRecap {
  overallScore: number
  participantCount: number
  summary: string
  strengths: string[]
  concerns: string[]
  recommendations: string[]
}

export interface EssaySuggestInput {
  questionText: string
  answerText: string
  maxScore?: number
  rubric?: string
  minWords?: number
}

export interface EssaySuggestion {
  score: number
  feedback: string
  wordCount: number
  sentenceCount: number
  keywordHits: number
  keywordTotal: number
}

const STOPWORDS = new Set([
  'yang', 'dan', 'atau', 'dengan', 'untuk', 'pada', 'adalah', 'dalam', 'dari',
  'sebagai', 'secara', 'tidak', 'akan', 'juga', 'dapat', 'karena', 'oleh',
  'ini', 'itu', 'tersebut', 'agar', 'supaya', 'jika', 'kalau', 'saat',
  'ketika', 'serta', 'antara', 'kepada', 'terhadap', 'mengenai', 'tentang',
  'setelah', 'sebelum', 'selama', 'bahwa', 'namun', 'tetapi', 'sedangkan',
  'sehingga', 'maka', 'yaitu', 'yakni', 'tiap', 'setiap', 'para', 'sudah',
  'telah', 'sedang', 'masih', 'hanya', 'saja', 'apa', 'bagaimana', 'mengapa',
  'berapa', 'kapan', 'dimana', 'jelaskan', 'sebutkan', 'uraikan', 'analisis',
])

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^a-z0-9\u00c0-\u024f\s-]/gi, ' ')
    .split(/\s+/)
    .map((w) => w.trim().replace(/^-+|-+$/g, ''))
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
}

function extractKeywords(text: string, limit = 12): string[] {
  const freq = new Map<string, number>()
  for (const token of tokenize(text)) {
    freq.set(token, (freq.get(token) ?? 0) + 1)
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word)
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function formatNum(value: number, digits = 1): string {
  return value.toLocaleString('id-ID', { maximumFractionDigits: digits, minimumFractionDigits: digits })
}

export function buildExamRecap(input: ExamRecapInput): ExamRecap {
  const scores = [...input.scores].sort((a, b) => b - a)
  const n = scores.length
  const avg = n === 0 ? 0 : scores.reduce((a, b) => a + b, 0) / n
  const median = n === 0 ? 0 : (scores[Math.floor(n / 2)] ?? 0)
  const max = n === 0 ? 0 : (scores[0] ?? 0)
  const min = n === 0 ? 0 : (scores[n - 1] ?? 0)
  const passed = input.passingGrade > 0 ? scores.filter((s) => s >= input.passingGrade).length : 0
  const passRate = n === 0 || input.passingGrade <= 0 ? null : (passed / n) * 100

  let peakLabel = '-'
  let peakCount = 0
  for (const bucket of input.distribution) {
    if (bucket.count > peakCount) {
      peakCount = bucket.count
      peakLabel = bucket.label
    }
  }

  const title = input.examTitle === '' ? 'ujian ini' : `"${input.examTitle}"`
  const parts: string[] = []
  parts.push(`Rekap otomatis ${title}: ${n} peserta, rata-rata ${formatNum(avg)}, median ${formatNum(median)}, nilai tertinggi ${formatNum(max)} dan terendah ${formatNum(min)}.`)
  if (passRate !== null) {
    parts.push(`Sebanyak ${passed} dari ${n} peserta (${formatNum(passRate, 0)}%) mencapai KKM ${formatNum(input.passingGrade, 0)}.`)
  }
  if (n > 0) {
    parts.push(`Peserta paling banyak menumpuk pada rentang nilai ${peakLabel} (${peakCount} peserta).`)
  }
  if (avg >= 80) {
    parts.push('Capaian keseluruhan tergolong sangat baik, pertahankan strategi pembelajaran saat ini.')
  } else if (avg >= 70) {
    parts.push('Capaian keseluruhan tergolong baik, masih ada ruang penguatan pada kelompok nilai bawah.')
  } else if (avg >= 60) {
    parts.push('Capaian keseluruhan berada di batas cukup, disarankan remedial terarah untuk kelompok bawah.')
  } else if (n > 0) {
    parts.push('Capaian keseluruhan masih rendah, disarankan pembahasan ulang materi pokok sebelum remedial.')
  }

  const strengths: string[] = []
  const concerns: string[] = []
  const recommendations: string[] = []

  if (passRate !== null && passRate >= 80) strengths.push(`${formatNum(passRate, 0)}% peserta tuntas KKM, ketuntasan kelas tercapai.`)
  if (avg >= 75) strengths.push(`Rata-rata kelas ${formatNum(avg)} menunjukkan penguasaan materi yang solid.`)
  if (median >= avg && n > 0) strengths.push('Median di atas rata-rata, sebagian besar peserta berada di kelompok atas.')
  if (strengths.length === 0 && n > 0) strengths.push(`${n - passed} peserta mendekati KKM dan berpeluang tuntas dengan penguatan singkat.`)

  if (passRate !== null && passRate < 60) concerns.push(`Ketuntasan baru ${formatNum(passRate, 0)}%, ${n - passed} peserta belum mencapai KKM.`)
  if (n > 0 && min < 50) concerns.push(`Nilai terendah ${formatNum(min)} menandakan ada peserta yang tertinggal jauh.`)
  if (n > 0 && max - min > 40) concerns.push(`Rentang nilai lebar (${formatNum(max - min, 0)} poin), kesenjangan antar peserta cukup besar.`)

  const low = input.lowQuestions.slice(0, 3)
  for (const q of low) {
    const pct = q.attemptedBy > 0 ? (q.answered / q.attemptedBy) * 100 : 0
    if (pct < 70 && q.text.trim() !== '') {
      concerns.push(`Soal "${stripTags(q.text).slice(0, 90)}" hanya dijawab ${formatNum(pct, 0)}% peserta, perlu ditinjau ulang.`)
    }
  }

  if (passRate !== null && passRate < 80) recommendations.push('Adakan remedial terarah untuk peserta di bawah KKM, fokus pada materi dengan jawaban terendah.')
  if (avg < 70 && n > 0) recommendations.push('Lakukan pembahasan soal bersama di kelas sebelum ujian susulan.')
  if (low.length > 0) recommendations.push('Tinjau ulang redaksi soal dengan tingkat jawaban terendah, pastikan tidak ambigu.')
  if (n > 0 && max - min > 40) recommendations.push('Bentuk kelompok belajar campuran agar peserta atas membantu peserta bawah.')
  if (recommendations.length === 0) recommendations.push('Pertahankan ritme belajar, berikan soal pengayaan agar capaian tidak turun.')

  return {
    overallScore: Math.round(avg * 10) / 10,
    participantCount: n,
    summary: parts.join(' '),
    strengths: strengths.slice(0, 4),
    concerns: concerns.slice(0, 4),
    recommendations: recommendations.slice(0, 4),
  }
}

export function suggestEssayScore(input: EssaySuggestInput): EssaySuggestion {
  const maxScore = input.maxScore ?? 100
  const plainAnswer = stripTags(input.answerText)
  const plainQuestion = stripTags(input.questionText)
  const words = plainAnswer.split(/\s+/).filter(Boolean)
  const wordCount = plainAnswer === '' ? 0 : words.length
  const sentenceCount = plainAnswer === '' ? 0 : plainAnswer.split(/[.!?…\n]+/).map((s) => s.trim()).filter((s) => s.length > 0).length

  const questionKeywords = extractKeywords(plainQuestion, 12)
  const answerLower = ` ${plainAnswer.toLowerCase()} `
  let hits = 0
  for (const keyword of questionKeywords) {
    if (answerLower.includes(keyword.toLowerCase())) hits += 1
  }

  const rubricKeywords = (input.rubric ?? '').trim() === '' ? [] : extractKeywords(input.rubric ?? '', 10)
  let rubricHits = 0
  for (const keyword of rubricKeywords) {
    if (answerLower.includes(keyword.toLowerCase())) rubricHits += 1
  }

  const coverage = questionKeywords.length === 0 ? (wordCount > 0 ? 0.6 : 0) : hits / questionKeywords.length
  const rubricCoverage = rubricKeywords.length === 0 ? coverage : rubricHits / rubricKeywords.length

  let lengthFactor = 0
  if (wordCount >= 80) lengthFactor = 1
  else if (wordCount >= 40) lengthFactor = 0.85
  else if (wordCount >= 20) lengthFactor = 0.7
  else if (wordCount >= 10) lengthFactor = 0.5
  else if (wordCount >= 3) lengthFactor = 0.3
  else if (wordCount > 0) lengthFactor = 0.15

  if ((input.minWords ?? 0) > 0 && wordCount < (input.minWords ?? 0) && wordCount > 0) {
    lengthFactor = Math.min(lengthFactor, (wordCount / (input.minWords ?? 1)) * 0.7)
  }

  let structureFactor = 0
  if (sentenceCount >= 3) structureFactor = 1
  else if (sentenceCount === 2) structureFactor = 0.85
  else if (sentenceCount === 1) structureFactor = 0.7

  let raw: number
  if (rubricKeywords.length > 0) {
    raw = 0.45 * coverage + 0.25 * rubricCoverage + 0.2 * lengthFactor + 0.1 * structureFactor
  } else {
    raw = 0.55 * coverage + 0.3 * lengthFactor + 0.15 * structureFactor
  }

  if (wordCount === 0) raw = 0
  const score = Math.max(0, Math.min(maxScore, Math.round(raw * maxScore)))

  const feedbackParts: string[] = []
  feedbackParts.push(`Draf penilaian otomatis (lokal, tanpa internet): ${wordCount} kata dalam ${sentenceCount} kalimat, kecocokan kata kunci ${hits}/${questionKeywords.length}.`)
  if (wordCount === 0) {
    feedbackParts.push('Jawaban kosong sehingga disarankan nilai 0. Minta siswa mengisi ulang bila memungkinkan.')
  } else {
    if (coverage >= 0.7) feedbackParts.push('Jawaban sudah menyinggung sebagian besar kata kunci soal.')
    else if (coverage >= 0.4) feedbackParts.push('Jawaban menyinggung sebagian kata kunci, masih bisa dilengkapi.')
    else feedbackParts.push('Jawaban kurang memuat kata kunci soal, periksa kembali relevansi isi.')
    if ((input.minWords ?? 0) > 0 && wordCount < (input.minWords ?? 0)) {
      feedbackParts.push(`Panjang jawaban di bawah minimal ${input.minWords} kata, pertimbangkan pengurangan nilai.`)
    }
    if (rubricKeywords.length > 0) {
      feedbackParts.push(`Kecocokan rubrik ${rubricHits}/${rubricKeywords.length}. Sesuaikan dengan penilaian profesional guru.`)
    }
    feedbackParts.push('Angka ini hanya saran awal, nilai final tetap keputusan guru setelah membaca utuh jawaban siswa.')
  }

  return {
    score,
    feedback: feedbackParts.join(' '),
    wordCount,
    sentenceCount,
    keywordHits: hits,
    keywordTotal: questionKeywords.length,
  }
}

export function buildExplanationDraft(input: {
  questionText: string
  type: string
  optionsText: string[]
  correctAnswer: string
}): string {
  const plain = stripTags(input.questionText).slice(0, 400)
  const letters = ['A', 'B', 'C', 'D', 'E', 'F']
  const filled = input.optionsText.map((t) => t.trim()).filter((t) => t !== '')
  const header = plain === '' ? 'Pembahasan soal:' : `Pembahasan: ${plain}`
  let keyPart = ''
  if (input.type === 'multiple_choice' || input.type === 'multiple_response') {
    const picked = input.correctAnswer.toUpperCase().split(',').map((s) => s.trim()).filter(Boolean)
    const named = picked.length === 0
      ? 'periksa kembali opsi yang ditandai benar'
      : picked.map((p) => {
          const idx = letters.indexOf(p)
          const text = idx >= 0 && filled[idx] ? ` (${filled[idx].slice(0, 80)})` : ''
          return `opsi ${p}${text}`
        }).join(' dan ')
    keyPart = `Kunci jawaban: ${named}. Pilih jawaban yang paling sesuai konsep, singkirkan pengecoh yang bertentangan dengan materi.`
  } else if (input.type === 'true_false') {
    keyPart = `Kunci jawaban: ${input.correctAnswer === '' ? 'Benar/Salah sesuai konsep' : input.correctAnswer}. Ingat kembali definisi materi, lalu uji pernyataan satu per satu.`
  } else if (input.type === 'short_answer') {
    keyPart = input.correctAnswer === ''
      ? 'Jawaban diterima sesuai daftar kunci isian singkat (abaikan kapital dan spasi berlebih).'
      : `Jawaban yang diterima: ${input.correctAnswer}. Tulis singkat dan tepat tanpa kata tambahan.`
  } else if (input.type === 'matching') {
    keyPart = 'Pasangkan setiap item kiri dengan pasangan kanannya berdasarkan konsep yang tepat, kerjakan dari pasangan yang paling yakin dulu.'
  } else {
    keyPart = input.correctAnswer === ''
      ? 'Nilai berdasarkan kelengkapan argumen, ketepatan konsep, dan keruntutan penulisan.'
      : `Acuan penilaian: ${input.correctAnswer}.`
  }
  return `${header} ${keyPart} Sunting draf ini sebelum disimpan agar sesuai bahasa dan materi kelas.`
}
