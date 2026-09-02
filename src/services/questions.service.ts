import { supabase } from './client'
import { logAudit } from './audit.service'
import type { BankStatus, Difficulty, MatchingPair, Question, QuestionBank, QuestionOption, QuestionType } from '@/types/models'

export interface BankInput {
  title: string
  description?: string | null
  subject_id?: string | null
  grade_level?: number | null
  tags?: string[]
  status?: BankStatus
}

export async function listBanks(params: {
  search?: string
  subjectId?: string
  status?: string
  page?: number
  pageSize?: number
}): Promise<{ rows: QuestionBank[]; total: number }> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  let builder = supabase
    .from('question_banks')
    .select('*, subjects(name), profiles(full_name)', { count: 'exact' })
  if (params.search) builder = builder.ilike('title', `%${params.search}%`)
  if (params.subjectId) builder = builder.eq('subject_id', params.subjectId)
  if (params.status) builder = builder.eq('status', params.status)

  const { data, error, count } = await builder
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)
  if (error) throw error
  return { rows: (data as unknown as QuestionBank[]) ?? [], total: count ?? 0 }
}

export async function createBank(input: BankInput): Promise<QuestionBank> {
  const { data: sessionData } = await supabase.auth.getSession()
  const uid = sessionData.session?.user?.id
  if (!uid) throw new Error('Tidak ada sesi.')
  const { data, error } = await supabase
    .from('question_banks')
    .insert({ ...input, author_id: uid })
    .select()
    .single()
  if (error) throw error
  void logAudit('CREATE_QUESTION', 'question_bank', data.id, { title: input.title })
  return data as QuestionBank
}

export async function updateBank(id: string, input: Partial<BankInput>): Promise<void> {
  const { error } = await supabase.from('question_banks').update(input).eq('id', id)
  if (error) throw error
  void logAudit('UPDATE_QUESTION', 'question_bank', id)
}

export async function deleteBank(id: string): Promise<void> {
  const { error } = await supabase.from('question_banks').delete().eq('id', id)
  if (error) throw error
  void logAudit('DELETE_QUESTION', 'question_bank', id)
}

// ---------- Questions ----------
export interface QuestionFilter {
  bankId?: string
  type?: QuestionType
  difficulty?: Difficulty
  search?: string
  page?: number
  pageSize?: number
}

export async function listQuestions(filter: QuestionFilter = {}): Promise<{ rows: Question[]; total: number }> {
  const page = filter.page ?? 1
  const pageSize = filter.pageSize ?? 20
  let builder = supabase
    .from('questions')
    .select('*, question_options(*), matching_pairs(*)', { count: 'exact' })
  if (filter.bankId) builder = builder.eq('bank_id', filter.bankId)
  if (filter.type) builder = builder.eq('type', filter.type)
  if (filter.difficulty) builder = builder.eq('difficulty', filter.difficulty)
  if (filter.search) builder = builder.ilike('text', `%${filter.search}%`)

  const { data, error, count } = await builder
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)
  if (error) throw error

  const rows = ((data as unknown as (Question & { question_options: QuestionOption[]; matching_pairs: MatchingPair[] })[]) ?? []).map(
    (q) => ({
      ...q,
      question_options: (q.question_options ?? []).sort((a, b) => a.position - b.position),
      matching_pairs: (q.matching_pairs ?? []).sort((a, b) => a.position - b.position),
    }),
  )
  return { rows, total: count ?? 0 }
}

export async function getQuestionsByIds(ids: string[]): Promise<Question[]> {
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from('questions')
    .select('*, question_options(*), matching_pairs(*)')
    .in('id', ids)
  if (error) throw error
  return ((data as unknown as Question[]) ?? []).map((q) => ({
    ...q,
    question_options: (q.question_options ?? []).sort((a, b) => a.position - b.position),
    matching_pairs: (q.matching_pairs ?? []).sort((a, b) => a.position - b.position),
  }))
}

export interface QuestionInput {
  bank_id: string
  type: QuestionType
  text: string
  media_url?: string | null
  media_type?: 'image' | 'audio' | 'video' | null
  difficulty?: Difficulty
  points?: number
  explanation?: string | null
  scoring_rule?: Record<string, unknown>
  default_answer?: Record<string, unknown> | null
  options?: { option_text: string; media_url?: string | null; is_correct: boolean }[]
  pairs?: { left_text: string; right_text: string }[]
}

export async function createQuestion(input: QuestionInput): Promise<Question> {
  const { data: sessionData } = await supabase.auth.getSession()
  const uid = sessionData.session?.user?.id
  if (!uid) throw new Error('Tidak ada sesi.')

  const { data, error } = await supabase
    .from('questions')
    .insert({
      bank_id: input.bank_id,
      type: input.type,
      text: input.text,
      media_url: input.media_url ?? null,
      media_type: input.media_type ?? null,
      difficulty: input.difficulty ?? 'medium',
      points: input.points ?? 1,
      explanation: input.explanation ?? null,
      scoring_rule: input.scoring_rule ?? {},
      default_answer: buildDefaultAnswer(input),
      author_id: uid,
    })
    .select()
    .single()
  if (error) throw error

  await persistChildren(data.id, input)
  void logAudit('CREATE_QUESTION', 'question', data.id, { type: input.type })
  return data as Question
}

export async function updateQuestion(id: string, input: QuestionInput): Promise<void> {
  const { error } = await supabase
    .from('questions')
    .update({
      bank_id: input.bank_id,
      type: input.type,
      text: input.text,
      media_url: input.media_url ?? null,
      media_type: input.media_type ?? null,
      difficulty: input.difficulty ?? 'medium',
      points: input.points ?? 1,
      explanation: input.explanation ?? null,
      scoring_rule: input.scoring_rule ?? {},
      default_answer: buildDefaultAnswer(input),
    })
    .eq('id', id)
  if (error) throw error

  await supabase.from('question_options').delete().eq('question_id', id)
  await supabase.from('matching_pairs').delete().eq('question_id', id)
  await persistChildren(id, input)
  void logAudit('UPDATE_QUESTION', 'question', id, { type: input.type })
}

function buildDefaultAnswer(input: QuestionInput): Record<string, unknown> | null {
  switch (input.type) {
    case 'true_false':
      return { answer: String((input.scoring_rule as Record<string, unknown>)?.tf_answer === true || input.scoring_rule?.tf_answer === 'true') }
    case 'short_answer': {
      const accepted = (input.scoring_rule?.accepted as string[] | undefined) ?? []
      return { accepted }
    }
    case 'essay': {
      const rubric = (input.scoring_rule?.rubric as string | undefined) ?? ''
      const minWords = Number(input.scoring_rule?.min_words ?? 0) || 0
      const maxWords = Number(input.scoring_rule?.max_words ?? 0) || 0
      return { rubric, min_words: minWords, max_words: maxWords }
    }
    default:
      return null
  }
}

async function persistChildren(questionId: string, input: QuestionInput): Promise<void> {
  if (input.options && input.options.length > 0) {
    const { error } = await supabase.from('question_options').insert(
      input.options.map((o, i) => ({
        question_id: questionId,
        option_text: o.option_text,
        media_url: o.media_url ?? null,
        is_correct: Boolean(o.is_correct),
        position: i,
      })),
    )
    if (error) throw error
  }
  if (input.pairs && input.pairs.length > 0) {
    const { error } = await supabase.from('matching_pairs').insert(
      input.pairs.map((p, i) => ({
        question_id: questionId,
        left_text: p.left_text,
        right_text: p.right_text,
        position: i,
      })),
    )
    if (error) throw error
  }
}

export async function deleteQuestion(id: string): Promise<void> {
  const { error } = await supabase.from('questions').delete().eq('id', id)
  if (error) throw error
  void logAudit('DELETE_QUESTION', 'question', id)
}
