export type AiFeature =
  | 'generate-questions'
  | 'explain-question'
  | 'grade-essay'
  | 'analyze-exam'
  | 'generate-remedial'
  | 'generate-enrichment'
  | 'improve-question'
  | 'extract-key-concepts'
  | 'match-cognitive-level'

export type QuestionType =
  | 'multiple_choice'
  | 'multiple_response'
  | 'true_false'
  | 'matching'
  | 'short_answer'
  | 'essay'

export type Difficulty = 'easy' | 'medium' | 'hard'

export interface AiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AiProvider {
  readonly name: string
  readonly modelId: string
  generate(options: {
    messages: AiMessage[]
    maxTokens?: number
    temperature?: number
    feature: AiFeature
    tenantId: string
  }): Promise<AiGenerationResult>
}

export interface AiGenerationResult {
  content: string
  tokensInput: number
  tokensOutput: number
  model: string
}

export interface GeneratedQuestion {
  type: QuestionType
  question: string
  options: string[] | null
  pairs: { left: string; right: string }[] | null
  correctAnswer: string
  explanation: string
  difficulty: Difficulty
  topic: string
  cognitiveLevel?: 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6'
}

export interface EssayGradeResult {
  score: number
  feedback: string
  wordCount: number
  sentenceCount: number
}

export interface ExamAnalysisResult {
  summary: string
  strengths: string[]
  concerns: string[]
  recommendations: string[]
  overallScore: number
  participantCount: number
}

export interface KeyConcept {
  concept: string
  description: string
  indicator: string
}

export type AiProviderName = 'gemini' | 'openrouter' | 'groq'
