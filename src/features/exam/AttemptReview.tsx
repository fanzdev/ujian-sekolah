import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { RichContent } from '@/components/ui/RichTextEditor'
import type { AttemptPayload, ClientQuestion } from '@/types/models'

export default function AttemptReview({ payload }: { payload: AttemptPayload; onClose: () => void }) {
  const reveal = payload.exam.show_answers_after && payload.attempt.status !== 'in_progress'

  if (!payload.exam.show_result_to_student) {
    return <p className="px-6 py-12 text-center text-sm text-slate-400">Hasil ujian ini tidak ditampilkan kepada siswa.</p>
  }

  if (!reveal) {
    return (
      <div className="space-y-4 px-6 py-6">
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500 dark:bg-slate-800 dark:text-slate-200">
          Pembahasan & kunci jawaban belum dibuka untuk ujian ini.
        </p>
        <ol className="space-y-3">
          {payload.order.map((qid, i) => {
            const q = payload.questions[qid]
            const ans = payload.answers[qid]
            const answered = isAnswered(ans)
            return (
              <li key={qid} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-200">
                  {i + 1}
                </span>
                <RichContent html={q?.text ?? ''} className="min-w-0 flex-1 [&_*]:text-[13px]" />
                <Badge tone={answered ? 'green' : 'gray'}>{answered ? 'Dijawab' : 'Kosong'}</Badge>
              </li>
            )
          })}
        </ol>
      </div>
    )
  }

  return (
    <div className="space-y-5 px-6 py-6">
      {payload.order.map((qid, i) => {
        const q = payload.questions[qid]
        if (!q) return null
        const ans = payload.answers[qid]
        const correctness = judge(q, ans)

        return (
          <article key={qid} className="rounded-xl border border-slate-200 p-4">
            <header className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Soal {i + 1}
              </p>
              {correctness === true && <Badge tone="green">Benar</Badge>}
              {correctness === false && <Badge tone="red">Salah / Kurang</Badge>}
              {correctness === null && <Badge tone="amber">{q.type === 'essay' ? 'Essay · dinilai guru' : 'Subjektif'}</Badge>}
            </header>

            <RichContent html={q.text} className="[&_*]:text-sm" />

            <div className="mt-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800 dark:text-slate-200">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Jawaban Anda</p>
              <AnswerPreview question={q} answer={ans} />
            </div>

            {correctness === false && Array.isArray(q.accepted_answers) && q.accepted_answers.length > 0 && (
              <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                Jawaban diterima: {q.accepted_answers.join(' ; ')}
              </p>
            )}

            {Array.isArray(q.correct_pairs) && q.correct_pairs.length > 0 && (
              <div className="mt-2 rounded-xl bg-emerald-50 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-600">Kunci Menjodohkan</p>
                <ul className="mt-1 space-y-0.5 text-xs text-emerald-800">
                  {q.correct_pairs.map((p, idx) => (
                    <li key={idx}>
                      {idx + 1}. {strip(p.left)} → {strip(p.right)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {q.type !== 'essay' && q.options?.some((o) => o.is_correct) && (
              <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                Kunci:{' '}
                {(q.options ?? [])
                  .filter((o) => o.is_correct)
                  .map((o) => strip(o.text))
                  .join('; ')}
              </p>
            )}

            {q.explanation && (
              <div className="mt-2 rounded-lg bg-sky-50 px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-sky-600">Pembahasan</p>
                <RichContent html={q.explanation} className="[&_*]:text-xs" />
              </div>
            )}
          </article>
        )
      })}

      <div className="flex justify-end pb-2">
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          Cetak Halaman
        </Button>
      </div>
    </div>
  )
}

function strip(html: string): string {
  return html.replace(/<[^>]*>/g, '').slice(0, 80)
}

function isAnswered(ans: unknown): boolean {
  if (ans === null || ans === undefined) return false
  if (Array.isArray(ans)) return ans.length > 0
  if (typeof ans === 'string') return ans.trim().length > 0
  if (typeof ans === 'object') return Object.keys(ans as object).length > 0
  return true
}

function judge(q: ClientQuestion, ans: unknown): boolean | null {
  if (q.type === 'essay') return null
  const correctIds = new Set((q.options ?? []).filter((o) => o.is_correct).map((o) => o.id))

  switch (q.type) {
    case 'multiple_choice':
      return typeof ans === 'string' && correctIds.has(String(ans))
    case 'multiple_response': {
      if (!Array.isArray(ans)) return false
      return (ans as string[]).every((id) => correctIds.has(id)) && (ans as string[]).length === correctIds.size
    }
    case 'true_false':
      return String(q.correct_answer) === String(ans)
    case 'short_answer': {
      if (typeof ans !== 'string') return false
      return (q.accepted_answers ?? []).some((a) => a.toLowerCase().trim() === String(ans).toLowerCase().trim())
    }
    default:
      return null
  }
}

function AnswerPreview({ question, answer }: { question: ClientQuestion; answer: unknown }) {
  if (!isAnswered(answer)) return <p className="mt-1 text-xs italic text-slate-400">Tidak dijawab.</p>

  if (question.type === 'multiple_choice' || question.type === 'multiple_response') {
    const ids = Array.isArray(answer) ? (answer as string[]) : [String(answer)]
    const texts = (question.options ?? [])
      .filter((o) => ids.includes(o.id))
      .map((o) => strip(o.text))
    return <p className="mt-1 text-xs font-medium text-slate-700">{texts.join('; ') || JSON.stringify(answer)}</p>
  }

  if (question.type === 'matching' && typeof answer === 'object') {
    const map = answer as Record<string, number>
    return (
      <ul className="mt-1 space-y-0.5 text-xs text-slate-700">
        {Object.entries(map).map(([lk, rk]) => {
          const left = (question.left_items ?? []).find((l) => l.k === Number(lk))
          const right = (question.right_items ?? []).find((r) => r.k === rk)
          return (
            <li key={lk}>
              {left?.k}. {strip(left?.text ?? '')} →{' '}
              <strong>
                {right?.k}. {strip(right?.text ?? '')}
              </strong>
            </li>
          )
        })}
      </ul>
    )
  }

  if (question.type === 'true_false') {
    const v = answer === true || answer === 'true'
    return <p className="mt-1 text-xs font-medium text-slate-700">{v ? 'BENAR' : 'SALAH'}</p>
  }

  if (typeof answer === 'object') {
    return <p className="mt-1 break-all font-mono text-[11px] text-slate-500">{JSON.stringify(answer)}</p>
  }

  return <p className="mt-1 text-xs leading-relaxed whitespace-pre-wrap text-slate-700">{String(answer)}</p>
}
