import { invokeEdge, EdgeInvokeError, probeEdgeFunction, type EdgeErrorKind } from './client'
import { createQuestion } from './questions.service'

export interface AiProviderStatus {
  index: number
  label: string
  freeModels: number
}

export interface AiStatus {
  ok: boolean
  configured: boolean
  providers: AiProviderStatus[]
}

export type AiQuestionType = 'multiple_choice' | 'true_false' | 'short_answer' | 'essay'
export type AiDifficulty = 'easy' | 'medium' | 'hard'

export interface AiGeneratedQuestion {
  type: AiQuestionType
  question: string
  options: string[] | null
  correctAnswer: string
  explanation: string
  difficulty: AiDifficulty
  topic: string
}

export interface AiGrade {
  score: number
  feedback: string
  correctAnswer: string
  improvement: string
}

export interface AiAnalysis {
  overallScore: number
  totalQuestions: number
  correctCount: number
  weakTopics: string[]
  strongTopics: string[]
  recommendations: string[]
  summary: string
}

export interface AiExplanation {
  explanation: string
  wrongAnswerAnalysis: Record<string, string> | null
  additionalContext: string
  studyTips: string[]
}

async function toFriendlyError(err: unknown): Promise<Error> {
  const kind: EdgeErrorKind = err instanceof EdgeInvokeError ? err.kind : 'unknown'
  const message = err instanceof Error ? err.message : String(err)
  if (kind === 'cors_or_network' || kind === 'not_deployed') {
    const probe = await probeEdgeFunction('ai-proxy')
    if (probe === 'not_found') {
      return new Error('Fitur AI belum aktif. Deploy Edge Function "ai-proxy" dan isi API key dulu (lihat AI_SETUP.md).')
    }
  }
  return err instanceof Error ? err : new Error(message)
}

export async function aiStatus(): Promise<AiStatus> {
  try {
    return await invokeEdge<AiStatus>('ai-proxy', { action: 'status' }, { timeoutMs: 25000 })
  } catch (err) {
    throw await toFriendlyError(err)
  }
}

export async function aiGenerateQuestions(input: {
  topic: string
  count?: number
  type?: AiQuestionType | 'mixed' | AiQuestionType[]
  difficulty?: AiDifficulty | 'mixed'
  notes?: string
}): Promise<AiGeneratedQuestion[]> {
  try {
    const result = await invokeEdge<{ ok: boolean; questions: AiGeneratedQuestion[] }>('ai-proxy', {
      action: 'generate-questions',
      topic: input.topic,
      options: { count: input.count, type: input.type, difficulty: input.difficulty, language: 'id', notes: input.notes?.trim() ? input.notes.trim() : undefined },
    })
    return result.questions ?? []
  } catch (err) {
    throw await toFriendlyError(err)
  }
}

export async function aiRefineQuestions(input: {
  questions: AiGeneratedQuestion[]
  instruction: string
}): Promise<AiGeneratedQuestion[]> {
  try {
    const result = await invokeEdge<{ ok: boolean; questions: AiGeneratedQuestion[] }>('ai-proxy', {
      action: 'refine-questions',
      questions: input.questions,
      instruction: input.instruction,
      options: { language: 'id' },
    })
    return result.questions ?? []
  } catch (err) {
    throw await toFriendlyError(err)
  }
}

export async function aiGradeEssay(input: {
  questionText: string
  answerText: string
  maxScore?: number
  rubric?: string
}): Promise<AiGrade> {
  try {
    const result = await invokeEdge<{ ok: boolean; result: AiGrade }>('ai-proxy', {
      action: 'grade-essay',
      questionText: input.questionText,
      answerText: input.answerText,
      options: { maxScore: input.maxScore ?? 100, language: 'id', rubric: input.rubric },
    })
    return result.result
  } catch (err) {
    throw await toFriendlyError(err)
  }
}

export async function aiAnalyzeResult(input: {
  examTitle: string
  totalQuestions: number
  rows: { score: number; passed: boolean | null }[]
}): Promise<AiAnalysis> {
  try {
    const result = await invokeEdge<{ ok: boolean; result: AiAnalysis }>('ai-proxy', {
      action: 'analyze-result',
      examTitle: input.examTitle,
      totalQuestions: input.totalQuestions,
      rows: input.rows,
    })
    return result.result
  } catch (err) {
    throw await toFriendlyError(err)
  }
}

export async function saveAiQuestionsToBank(
  bankId: string,
  list: AiGeneratedQuestion[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ done: number; errors: string[] }> {
  const letters = ['A', 'B', 'C', 'D', 'E', 'F']
  let done = 0
  const errors: string[] = []
  for (const q of list) {
    try {
      const scoringRule: Record<string, unknown> = {}
      let options: { option_text: string; is_correct: boolean }[] | undefined
      if (q.type === 'multiple_choice') {
        const picked = q.correctAnswer.toUpperCase().split(',').map((s) => s.trim()).filter(Boolean)
        options = (q.options ?? []).map((text, idx) => ({ option_text: text, is_correct: picked.includes(letters[idx] ?? '') }))
        if (!options.some((o) => o.is_correct) && options.length > 0) options[0].is_correct = true
      } else if (q.type === 'true_false') {
        const norm = q.correctAnswer.toLowerCase()
        scoringRule.tf_answer = ['benar', 'true', 'b', '1', 'ya'].includes(norm)
      } else if (q.type === 'short_answer') {
        scoringRule.match_mode = 'exact'
        scoringRule.accepted = q.correctAnswer.split(';').map((s) => s.trim()).filter(Boolean)
      } else {
        scoringRule.rubric = q.explanation
      }
      await createQuestion({
        bank_id: bankId,
        type: q.type,
        text: q.question,
        difficulty: q.difficulty,
        points: 1,
        explanation: q.explanation || null,
        scoring_rule: scoringRule,
        options,
      })
      done++
      onProgress?.(done, list.length)
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }
  }
  return { done, errors }
}

export async function aiExplain(input: {
  questionText: string
  optionsText?: string[]
  correctAnswer?: string
  type?: string
  depth?: 'brief' | 'detailed'
}): Promise<AiExplanation> {
  try {
    const result = await invokeEdge<{ ok: boolean; result: AiExplanation }>('ai-proxy', {
      action: 'explain',
      questionText: input.questionText,
      optionsText: input.optionsText ?? [],
      correctAnswer: input.correctAnswer ?? '',
      type: input.type ?? '',
      options: { depth: input.depth ?? 'brief', language: 'id' },
    })
    return result.result
  } catch (err) {
    throw await toFriendlyError(err)
  }
}
