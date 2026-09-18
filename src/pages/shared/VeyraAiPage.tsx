import { useState, useEffect } from "react"
import { Bot, Sparkles, FileText, GraduationCap, Pencil, Brain, CheckCircle2, Loader2, Zap, Lightbulb, TrendingUp, Settings, Key, Eye, EyeOff, ShieldCheck } from "lucide-react"
import { useDocumentTitle } from "@/hooks/useAsync"
import { useToast } from "@/hooks/useToast"
import { Button } from "@/components/ui/Button"
import { Input, Textarea, Select } from "@/components/ui/Input"
import { Card, CardBody } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { veyraGenerateQuestions, veyraBuildExplanation, veyraGradeEssay, veyraBuildRemedial, veyraImproveQuestion, veyraExtractKeyConcepts, veyraMatchCognitiveLevel, VeyraAiError } from "@/services/veyra-ai.service"
import type { Difficulty, QuestionType } from "@/types/models"
import type { GeneratedQuestion, KeyConcept } from "@/services/ai-providers/interface"
import { fetchAiConfig, saveAiConfig, type AiConfig } from "@/services/settings.service"

type Tab = "generate" | "explain" | "grade" | "analyze" | "remedial" | "improve" | "concepts" | "level" | "setup"

const TABS: { id: Tab; label: string; icon: typeof Sparkles; desc: string }[] = [
  { id: "generate", label: "Generator Soal", icon: Sparkles, desc: "Buat soal otomatis dari materi" },
  { id: "explain", label: "Pembahasan", icon: FileText, desc: "Buat draf pembahasan soal" },
  { id: "grade", label: "Nilai Esai", icon: Pencil, desc: "Nilai jawaban essay otomatis" },
  { id: "analyze", label: "Analisis Ujian", icon: Brain, desc: "Ringkasan & insight ujian" },
  { id: "remedial", label: "Remedial", icon: GraduationCap, desc: "Soal perbaikan untuk yang belum tuntas" },
  { id: "improve", label: "Perbaiki Soal", icon: Zap, desc: "Sempurnakan soal yang sudah ada" },
  { id: "concepts", label: "Konsep Kunci", icon: Lightbulb, desc: "Ekstrak konsep dari materi" },
  { id: "level", label: "Level Kognitif", icon: TrendingUp, desc: "Tentukan level Bloom soal" },
  { id: "setup", label: "Setup AI", icon: Settings, desc: "Konfigurasi provider & API key" },
]

export default function VeyraAiPage() {
  useDocumentTitle("Veyra AI - Asisten Guru")
  const [activeTab, setActiveTab] = useState<Tab>("generate")
  const [loading, setLoading] = useState<string | null>(null)
  const [result, setResult] = useState<unknown>(null)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg">
          <Bot className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Veyra AI</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Asisten cerdas untuk guru SMK AL-FATA</p>
        </div>
        <Badge tone="purple" className="text-xs">V2.0</Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setResult(null) }}
              className={"flex flex-col items-center gap-1.5 p-3 rounded-xl text-center transition-all " + (isActive ? "bg-primary-500 text-white shadow-md" : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700")}
            >
              <Icon className={"w-5 h-5 " + (isActive ? "text-white" : "text-primary-500")} />
              <span className="text-xs font-medium">{tab.label}</span>
            </button>
          )
        })}
      </div>

      <Card className="border-0 shadow-sm">
        <CardBody className="p-6">
          <div className="mb-4 flex items-center gap-2">
            {(() => {
              const t = TABS.find((x) => x.id === activeTab)
              return t ? <>{t.icon && <t.icon className="w-4 h-4 text-primary-500" />}<span className="text-sm text-slate-500">{t.desc}</span></> : null
            })()}
          </div>

          {activeTab === "generate" && <GenerateTab loading={loading === "generate"} result={result as GeneratedQuestion[] | null} setResult={setResult as any} setLoading={setLoading} />}
          {activeTab === "explain" && <ExplainTab loading={loading === "explain"} result={result as string | null} setResult={setResult as any} setLoading={setLoading} />}
          {activeTab === "grade" && <GradeTab loading={loading === "grade"} result={result as { score: number; feedback: string } | null} setResult={setResult as any} setLoading={setLoading} />}
          {activeTab === "analyze" && <AnalyzeTab loading={loading === "analyze"} result={result} setResult={setResult as any} setLoading={setLoading} />}
          {activeTab === "remedial" && <RemedialTab loading={loading === "remedial"} result={result as string | null} setResult={setResult as any} setLoading={setLoading} />}
          {activeTab === "improve" && <ImproveTab loading={loading === "improve"} result={result as GeneratedQuestion | null} setResult={setResult as any} setLoading={setLoading} />}
          {activeTab === "concepts" && <ConceptsTab loading={loading === "concepts"} result={result as KeyConcept[] | null} setResult={setResult as any} setLoading={setLoading} />}
          {activeTab === "level" && <LevelTab loading={loading === "level"} result={result as { level: string; reasoning: string } | null} setResult={setResult as any} setLoading={setLoading} />}
          {activeTab === "setup" && <SetupTab />}
        </CardBody>
      </Card>
    </div>
  )
}

function GenerateTab({ loading, result, setResult, setLoading }: { loading: boolean; result: GeneratedQuestion[] | null; setResult: React.Dispatch<React.SetStateAction<unknown>>; setLoading: React.Dispatch<React.SetStateAction<string | null>> }) {
  const toast = useToast()
  const [subject, setSubject] = useState("")
  const [gradeLevel, setGradeLevel] = useState("")
  const [material, setMaterial] = useState("")
  const [count, setCount] = useState(5)
  const [type, setType] = useState("mixed")
  const [difficulty, setDifficulty] = useState("mixed")

  const run = async () => {
    if (subject.trim() === "") { toast.error("Mata pelajaran wajib diisi."); return }
    if (material.trim().length < 10) { toast.error("Materi minimal 10 karakter."); return }
    setLoading("generate")
    setResult(null)
    try {
      const res = await veyraGenerateQuestions({ subject: subject.trim(), gradeLevel: gradeLevel.trim(), material: material.trim(), count, type: type as QuestionType | "mixed", difficulty: difficulty as Difficulty | "mixed" })
      setResult(res)
      toast.success("Berhasil membuat " + res.length + " soal")
    } catch (err) {
      toast.error(err instanceof VeyraAiError ? err.message : err instanceof Error ? err.message : "Gagal membuat soal")
    } finally { setLoading(null) }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2"><label className="label-base">Mata Pelajaran</label><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="contoh: Pemrograman Web" /></div>
        <div className="space-y-2"><label className="label-base">Level Kelas</label><Input value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} placeholder="contoh: XI SMK" /></div>
        <div className="space-y-2 md:col-span-2"><label className="label-base">Materi / Topik</label><Textarea value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="Jelaskan materi secara detail..." rows={4} /></div>
        <div className="space-y-2"><label className="label-base">Jumlah Soal</label><Select options={[1,2,3,4,5,10,15,20].map(n => ({value: String(n), label: String(n)}))} value={String(count)} onChange={(e) => setCount(Number(e.target.value))} /></div>
        <div className="space-y-2"><label className="label-base">Tipe Soal</label><Select options={[{value:"mixed",label:"Campur"},{value:"multiple_choice",label:"Pilihan Ganda"},{value:"multiple_response",label:"PG Kompleks"},{value:"true_false",label:"Benar/Salah"},{value:"matching",label:"Menjodohkan"},{value:"short_answer",label:"Isian Singkat"},{value:"essay",label:"Esai"}]} value={type} onChange={(e) => setType(e.target.value)} /></div>
        <div className="space-y-2"><label className="label-base">Kesulitan</label><Select options={[{value:"mixed",label:"Campur"},{value:"easy",label:"Mudah"},{value:"medium",label:"Sedang"},{value:"hard",label:"Sulit"}]} value={difficulty} onChange={(e) => setDifficulty(e.target.value)} /></div>
      </div>
      <Button onClick={run} disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}{loading ? "Membuat..." : "Buat Soal dengan Veyra AI"}</Button>
      {result && (result as GeneratedQuestion[]).length > 0 && (
        <div className="space-y-3 mt-4">
          <p className="text-sm text-muted-foreground">{(result as GeneratedQuestion[]).length} soal berhasil dibuat</p>
          {(result as GeneratedQuestion[]).map((q, i) => (
            <Card key={i} className="p-4 space-y-2">
              <div className="flex items-start gap-3">
                <Badge tone="blue">Soal {i + 1}</Badge>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{q.question}</p>
                  {q.options && <p className="text-xs text-muted-foreground mt-1">{q.options.map((o, oi) => String.fromCharCode(65 + oi) + ". " + o).join(" | ")}</p>}
                  <p className="text-xs text-muted-foreground mt-1">Jawaban: {q.correctAnswer} | {q.explanation}</p>
                  <div className="flex gap-2 mt-1">
                    <Badge tone={q.difficulty === "easy" ? "green" : q.difficulty === "medium" ? "amber" : "red"}>{q.difficulty}</Badge>
                    {q.cognitiveLevel && <Badge tone="purple">{q.cognitiveLevel}</Badge>}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function ExplainTab({ loading, result, setResult, setLoading }: { loading: boolean; result: string | null; setResult: React.Dispatch<React.SetStateAction<unknown>>; setLoading: React.Dispatch<React.SetStateAction<string | null>> }) {
  const toast = useToast()
  const [questionText, setQuestionText] = useState("")
  const [optionsText, setOptionsText] = useState<string[]>(["", "", "", ""])
  const [correctAnswer, setCorrectAnswer] = useState("A")
  const [type, setType] = useState<QuestionType>("multiple_choice")

  const run = async () => {
    if (questionText.trim().length < 10) { toast.error("Soal minimal 10 karakter."); return }
    setLoading("explain")
    setResult(null)
    try {
      const res = await veyraBuildExplanation({ questionText: questionText.trim(), type, optionsText: optionsText.filter(Boolean), correctAnswer })
      setResult(res)
    } catch (err) {
      toast.error(err instanceof VeyraAiError ? err.message : err instanceof Error ? err.message : "Gagal")
    } finally { setLoading(null) }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2"><label className="label-base">Soal</label><Textarea value={questionText} onChange={(e) => setQuestionText(e.target.value)} rows={3} placeholder="Tulis soal di sini..." /></div>
      {(type === "multiple_choice" || type === "multiple_response") && (
        <div className="space-y-2">
          <label className="label-base">Pilihan</label>
          <div className="space-y-2">
            {optionsText.map((opt, i) => (
              <Input key={i} value={opt} onChange={(e) => { const next = [...optionsText]; next[i] = e.target.value; setOptionsText(next); }} placeholder={"Opsi " + String.fromCharCode(65 + i)} />
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><label className="label-base">Tipe</label><Select options={[{value:"multiple_choice",label:"Pilihan Ganda"},{value:"multiple_response",label:"PG Kompleks"},{value:"true_false",label:"Benar/Salah"},{value:"short_answer",label:"Isian Singkat"}]} value={type} onChange={(e) => setType(e.target.value as QuestionType)} /></div>
        <div className="space-y-2"><label className="label-base">Kunci Jawaban</label>
          {type === "true_false"
            ? <Select options={[{value:"Benar",label:"Benar"},{value:"Salah",label:"Salah"}]} value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} />
            : <Select options={["A","B","C","D","E","F"].map(l => ({value: l, label: l}))} value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} />
          }
        </div>
      </div>
      <Button onClick={run} disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}{loading ? "Memproses..." : "Buat Pembahasan"}</Button>
      {result && <div className="mt-4 p-4 bg-muted rounded-lg"><p className="text-sm whitespace-pre-wrap">{result as string}</p></div>}
    </div>
  )
}

function GradeTab({ loading, result, setResult, setLoading }: { loading: boolean; result: { score: number; feedback: string } | null; setResult: React.Dispatch<React.SetStateAction<unknown>>; setLoading: React.Dispatch<React.SetStateAction<string | null>> }) {
  const toast = useToast()
  const [questionText, setQuestionText] = useState("")
  const [answerText, setAnswerText] = useState("")
  const [maxScore, setMaxScore] = useState(100)
  const [rubric, setRubric] = useState("")

  const run = async () => {
    if (answerText.trim().length < 10) { toast.error("Jawaban minimal 10 karakter."); return }
    setLoading("grade")
    setResult(null)
    try {
      const res = await veyraGradeEssay({ questionText: questionText.trim(), answerText: answerText.trim(), maxScore, rubric: rubric.trim() })
      setResult({ score: res.score, feedback: res.feedback })
    } catch (err) {
      toast.error(err instanceof VeyraAiError ? err.message : err instanceof Error ? err.message : "Gagal")
    } finally { setLoading(null) }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2"><label className="label-base">Soal Esai</label><Textarea value={questionText} onChange={(e) => setQuestionText(e.target.value)} rows={3} placeholder="Tulis soal esai..." /></div>
        <div className="space-y-2"><label className="label-base">Jawaban Siswa</label><Textarea value={answerText} onChange={(e) => setAnswerText(e.target.value)} rows={3} placeholder="Tempel jawaban siswa..." /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><label className="label-base">Skor Maksimal</label><Input type="number" value={maxScore} onChange={(e) => setMaxScore(Number(e.target.value))} min={1} max={1000} /></div>
        <div className="space-y-2"><label className="label-base">Rubrik (opsional)</label><Input value={rubric} onChange={(e) => setRubric(e.target.value)} placeholder="Kata kunci yang diharapkan..." /></div>
      </div>
      <Button onClick={run} disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Pencil className="w-4 h-4 mr-2" />}{loading ? "Menilai..." : "Nilai dengan Veyra AI"}</Button>
      {result && <div className="mt-4 p-4 bg-muted rounded-lg space-y-2"><div className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-green-500" /><span className="font-semibold">Skor: {(result as { score: number }).score} / {maxScore}</span></div><p className="text-sm text-muted-foreground">{(result as { feedback: string }).feedback}</p></div>}
    </div>
  )
}

function AnalyzeTab({ loading, setResult, setLoading }: { loading: boolean; result: unknown; setResult: React.Dispatch<React.SetStateAction<unknown>>; setLoading: React.Dispatch<React.SetStateAction<string | null>> }) {
  const toast = useToast()
  const [examTitle, setExamTitle] = useState("")
  const [scoresStr, setScoresStr] = useState("")
  const [passingGrade, setPassingGrade] = useState(75)

  const run = async () => {
    const { veyraAnalyzeExam } = await import("@/services/veyra-ai.service")
    const scores = scoresStr.split(/[,;\s]+/).map(Number).filter((n: number) => Number.isFinite(n) && n >= 0)
    if (scores.length === 0) { toast.error("Masukkan minimal 1 nilai."); return }
    setLoading("analyze")
    setResult(null)
    try {
      const res = await veyraAnalyzeExam({ examTitle: examTitle.trim(), scores, passingGrade })
      setResult(res)
    } catch (err) {
      toast.error(err instanceof VeyraAiError ? err.message : err instanceof Error ? err.message : "Gagal")
    } finally { setLoading(null) }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2"><label className="label-base">Nama Ujian</label><Input value={examTitle} onChange={(e) => setExamTitle(e.target.value)} placeholder="contoh: UTS Pemrograman Web" /></div>
      <div className="space-y-2"><label className="label-base">Nilai Peserta (pisahkan koma/spasi)</label><Textarea value={scoresStr} onChange={(e) => setScoresStr(e.target.value)} rows={3} placeholder="85 90 78 65 88..." /></div>
      <div className="space-y-2"><label className="label-base">KKM</label><Input type="number" value={passingGrade} onChange={(e) => setPassingGrade(Number(e.target.value))} min={0} max={100} /></div>
      <Button onClick={run} disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Brain className="w-4 h-4 mr-2" />}{loading ? "Menganalisis..." : "Analisis dengan Veyra AI"}</Button>
    </div>
  )
}

function RemedialTab({ loading, result, setResult, setLoading }: { loading: boolean; result: string | null; setResult: React.Dispatch<React.SetStateAction<unknown>>; setLoading: React.Dispatch<React.SetStateAction<string | null>> }) {
  const toast = useToast()
  const [material, setMaterial] = useState("")
  const [weakPoints, setWeakPoints] = useState("")
  const [count, setCount] = useState(5)

  const run = async () => {
    if (material.trim().length < 10) { toast.error("Materi minimal 10 karakter."); return }
    setLoading("remedial")
    setResult(null)
    try {
      const res = await veyraBuildRemedial({ material: material.trim(), weakPoints: weakPoints.trim(), count })
      setResult(res)
    } catch (err) {
      toast.error(err instanceof VeyraAiError ? err.message : err instanceof Error ? err.message : "Gagal")
    } finally { setLoading(null) }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2"><label className="label-base">Materi Pokok</label><Textarea value={material} onChange={(e) => setMaterial(e.target.value)} rows={2} placeholder="Materi yang perlu diremedial..." /></div>
      <div className="space-y-2"><label className="label-base">Poin Lemah (opsional)</label><Input value={weakPoints} onChange={(e) => setWeakPoints(e.target.value)} placeholder="Konsep yang sering salah..." /></div>
      <div className="space-y-2"><label className="label-base">Jumlah Soal</label><Select options={[1,2,3,5,10].map(n => ({value: String(n), label: String(n)}))} value={String(count)} onChange={(e) => setCount(Number(e.target.value))} /></div>
      <Button onClick={run} disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <GraduationCap className="w-4 h-4 mr-2" />}{loading ? "Membuat..." : "Buat Soal Remedial"}</Button>
      {result && <div className="mt-4 p-4 bg-muted rounded-lg"><p className="text-sm whitespace-pre-wrap">{result as string}</p></div>}
    </div>
  )
}

function ImproveTab({ loading, result, setResult, setLoading }: { loading: boolean; result: GeneratedQuestion | null; setResult: React.Dispatch<React.SetStateAction<unknown>>; setLoading: React.Dispatch<React.SetStateAction<string | null>> }) {
  const toast = useToast()
  const [questionText, setQuestionText] = useState("")
  const [type, setType] = useState<QuestionType>("multiple_choice")
  const [optionsText, setOptionsText] = useState<string[]>(["", "", "", ""])
  const [correctAnswer, setCorrectAnswer] = useState("A")
  const [difficulty, setDifficulty] = useState<Difficulty>("medium")

  const run = async () => {
    if (questionText.trim().length < 10) { toast.error("Soal minimal 10 karakter."); return }
    setLoading("improve")
    setResult(null)
    try {
      const res = await veyraImproveQuestion({
        questionText: questionText.trim(),
        type,
        optionsText: optionsText.filter(Boolean),
        correctAnswer,
        currentDifficulty: difficulty,
      })
      setResult(res)
    } catch (err) {
      toast.error(err instanceof VeyraAiError ? err.message : err instanceof Error ? err.message : "Gagal")
    } finally { setLoading(null) }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2"><label className="label-base">Soal yang ingin diperbaiki</label><Textarea value={questionText} onChange={(e) => setQuestionText(e.target.value)} rows={3} placeholder="Tempel soal yang ingin disempurnakan..." /></div>
      {(type === "multiple_choice" || type === "multiple_response") && (
        <div className="space-y-2">
          <label className="label-base">Pilihan Saat Ini</label>
          <div className="space-y-2">
            {optionsText.map((opt, i) => (
              <Input key={i} value={opt} onChange={(e) => { const next = [...optionsText]; next[i] = e.target.value; setOptionsText(next); }} placeholder={"Opsi " + String.fromCharCode(65 + i)} />
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2"><label className="label-base">Tipe</label><Select options={[{value:"multiple_choice",label:"Pilihan Ganda"},{value:"multiple_response",label:"PG Kompleks"},{value:"true_false",label:"Benar/Salah"},{value:"short_answer",label:"Isian Singkat"}]} value={type} onChange={(e) => setType(e.target.value as QuestionType)} /></div>
        <div className="space-y-2"><label className="label-base">Kunci</label>
          {type === "true_false"
            ? <Select options={[{value:"Benar",label:"Benar"},{value:"Salah",label:"Salah"}]} value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} />
            : <Select options={["A","B","C","D","E","F"].map(l => ({value: l, label: l}))} value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} />
          }
        </div>
        <div className="space-y-2"><label className="label-base">Kesulitan</label><Select options={[{value:"easy",label:"Mudah"},{value:"medium",label:"Sedang"},{value:"hard",label:"Sulit"}]} value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)} /></div>
      </div>
      <Button onClick={run} disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}{loading ? "Memproses..." : "Perbaiki Soal"}</Button>
      {result && (
        <div className="mt-4 p-4 bg-muted rounded-lg space-y-2">
          <div className="flex gap-2">
            <Badge tone="blue">{result.type}</Badge>
            <Badge tone={result.difficulty === "easy" ? "green" : result.difficulty === "medium" ? "amber" : "red"}>{result.difficulty}</Badge>
          </div>
          <p className="font-medium">{result.question}</p>
          {result.options && <p className="text-xs text-muted-foreground">{result.options.map((o, oi) => String.fromCharCode(65 + oi) + ". " + o).join(" | ")}</p>}
          <p className="text-sm">Jawaban: <span className="font-semibold">{result.correctAnswer}</span></p>
          <p className="text-sm text-muted-foreground">{result.explanation}</p>
        </div>
      )}
    </div>
  )
}

function ConceptsTab({ loading, result, setResult, setLoading }: { loading: boolean; result: KeyConcept[] | null; setResult: React.Dispatch<React.SetStateAction<unknown>>; setLoading: React.Dispatch<React.SetStateAction<string | null>> }) {
  const toast = useToast()
  const [subject, setSubject] = useState("")
  const [material, setMaterial] = useState("")

  const run = async () => {
    if (material.trim().length < 10) { toast.error("Materi minimal 10 karakter."); return }
    setLoading("concepts")
    setResult(null)
    try {
      const res = await veyraExtractKeyConcepts({ subject: subject.trim(), material: material.trim() })
      setResult(res)
    } catch (err) {
      toast.error(err instanceof VeyraAiError ? err.message : err instanceof Error ? err.message : "Gagal")
    } finally { setLoading(null) }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><label className="label-base">Mata Pelajaran</label><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="contoh: Pemrograman Web" /></div>
        <div className="space-y-2"><label className="label-base">Materi</label><Textarea value={material} onChange={(e) => setMaterial(e.target.value)} rows={4} placeholder="Tempel materi lengkap..." /></div>
      </div>
      <Button onClick={run} disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Lightbulb className="w-4 h-4 mr-2" />}{loading ? "Mengekstrak..." : "Ekstrak Konsep Kunci"}</Button>
      {result && (result as KeyConcept[]).length > 0 && (
        <div className="mt-4 space-y-3">
          {(result as KeyConcept[]).map((c, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-start gap-3">
                <Badge tone="purple">Konsep {i + 1}</Badge>
                <div>
                  <p className="font-semibold text-sm">{c.concept}</p>
                  <p className="text-xs text-muted-foreground mt-1">{c.description}</p>
                  <p className="text-xs text-muted-foreground mt-1"><span className="font-medium">Indikator:</span> {c.indicator}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function LevelTab({ loading, result, setResult, setLoading }: { loading: boolean; result: { level: string; reasoning: string } | null; setResult: React.Dispatch<React.SetStateAction<unknown>>; setLoading: React.Dispatch<React.SetStateAction<string | null>> }) {
  const toast = useToast()
  const [questionText, setQuestionText] = useState("")
  const [type, setType] = useState<QuestionType>("multiple_choice")

  const run = async () => {
    if (questionText.trim().length < 10) { toast.error("Soal minimal 10 karakter."); return }
    setLoading("level")
    setResult(null)
    try {
      const res = await veyraMatchCognitiveLevel({ questionText: questionText.trim(), type })
      setResult(res)
    } catch (err) {
      toast.error(err instanceof VeyraAiError ? err.message : err instanceof Error ? err.message : "Gagal")
    } finally { setLoading(null) }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2"><label className="label-base">Soal</label><Textarea value={questionText} onChange={(e) => setQuestionText(e.target.value)} rows={3} placeholder="Tempel soal untuk dianalisis level kognitifnya..." /></div>
      <div className="space-y-2"><label className="label-base">Tipe Soal</label><Select options={[{value:"multiple_choice",label:"Pilihan Ganda"},{value:"multiple_response",label:"PG Kompleks"},{value:"true_false",label:"Benar/Salah"},{value:"matching",label:"Menjodohkan"},{value:"short_answer",label:"Isian Singkat"},{value:"essay",label:"Esai"}]} value={type} onChange={(e) => setType(e.target.value as QuestionType)} /></div>
      <Button onClick={run} disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <TrendingUp className="w-4 h-4 mr-2" />}{loading ? "Menganalisis..." : "Tentukan Level Kognitif"}</Button>
      {result && (
        <div className="mt-4 p-4 bg-muted rounded-lg">
          <div className="flex items-center gap-3 mb-2">
            <Badge tone="purple" className="text-base px-3 py-1">{(result as { level: string }).level}</Badge>
            <span className="text-sm text-muted-foreground">Level Taksonomi Bloom</span>
          </div>
          <p className="text-sm">{(result as { reasoning: string }).reasoning}</p>
        </div>
      )}
    </div>
  )
}
function SetupTab() {
  const toast = useToast()
  const [config, setConfig] = useState<AiConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [form, setForm] = useState({ provider: 'gemini' as AiConfig['provider'], baseUrl: '', model: '', apiKey: '', temperature: 0.2 })

  const PROVIDERS: Record<string, { label: string; base: string; models: string[] }> = {
    gemini: { label: 'Google Gemini', base: 'https://generativelanguage.googleapis.com/v1beta', models: ['gemini-2.5-flash', 'gemini-2.0-flash'] },
    openrouter: { label: 'OpenRouter', base: 'https://openrouter.ai/api/v1', models: ['google/gemini-2.0-flash-001', 'meta-llama/llama-3.3-70b-instruct', 'openai/gpt-4o-mini'] },
    groq: { label: 'Groq', base: 'https://api.groq.com/openai/v1', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'] },
  }

  useEffect(() => {
    fetchAiConfig()
      .then((data) => {
        if (data && data.configured) {
          setForm({
            provider: data.provider,
            baseUrl: data.baseUrl,
            model: data.model,
            apiKey: data.key,
            temperature: data.temperature ?? 0.2,
          })
          setConfig(data)
        }
      })
      .catch(() => {})
  }, [])

  const handleSave = async () => {
    if (!form.baseUrl.trim() || !form.apiKey.trim() || !form.model.trim()) {
      toast.error('Harap isi semua field yang diperlukan.')
      return
    }
    setSaving(true)
    try {
      await saveAiConfig({
        provider: form.provider,
        baseUrl: form.baseUrl.trim(),
        model: form.model.trim(),
        key: form.apiKey.trim(),
        temperature: form.temperature,
      })
      await new Promise((r) => setTimeout(r, 300))
      const refreshed = await fetchAiConfig()
      if (refreshed && refreshed.configured) {
        setForm({
          provider: refreshed.provider,
          baseUrl: refreshed.baseUrl,
          model: refreshed.model,
          apiKey: refreshed.key,
          temperature: refreshed.temperature ?? 0.2,
        })
        setConfig(refreshed)
      }
      toast.success('Konfigurasi AI berhasil disimpan.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan konfigurasi AI.'
      toast.error(msg)
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
        <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
        <div>
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Konfigurasi Aman</p>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
            API Key disimpan di database Supabase dan hanya bisa diakses oleh Edge Function. Kunci tidak pernah tampil di browser setelah disimpan.
          </p>
        </div>
      </div>

      <Card className="border-0 shadow-sm">
        <CardBody className="p-6 space-y-5">
          <div className="space-y-2">
            <label className="label-base">Provider AI</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(Object.entries(PROVIDERS) as [string, { label: string; base: string; models: string[] }][]).map(([id, info]) => (
                <button
                  key={id}
                  onClick={() => setForm((f) => ({ ...f, provider: id as AiConfig['provider'], baseUrl: info.base, model: info.models[0] }))}
                  className={"p-3 rounded-xl border-2 text-left transition-all " + (form.provider === id ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20" : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600")}
                >
                  <p className="font-semibold text-sm">{info.label}</p>
                  <p className="text-xs text-muted-foreground mt-1 truncate">{info.base}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="label-base">Base URL</label>
            <Input
              value={form.baseUrl}
              onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
              placeholder="https://generativelanguage.googleapis.com/v1beta"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="label-base">Model</label>
              <Select
                options={PROVIDERS[form.provider].models.map((m) => ({ value: m, label: m }))}
                value={form.model}
                onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="label-base">Temperature ({form.temperature})</label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={form.temperature}
                onChange={(e) => setForm((f) => ({ ...f, temperature: parseFloat(e.target.value) }))}
                className="w-full accent-primary-500"
              />
              <p className="text-xs text-muted-foreground">0 = presisi, 1 = kreatif</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="label-base">API Key</label>
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary-500 transition-colors"
              >
                {showKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                {showKey ? 'Sembunyikan' : 'Tampilkan'}
              </button>
            </div>
            <Input
              type={showKey ? 'text' : 'password'}
              value={form.apiKey}
              onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
              placeholder="Masukkan API Key dari provider Anda"
              className="font-mono"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Key className="w-4 h-4 mr-2" />}
              {saving ? 'Menyimpan...' : 'Simpan Konfigurasi'}
            </Button>
            {config?.configured && (
              <Badge tone="green" className="flex items-center gap-1 text-xs">
                <CheckCircle2 className="w-3 h-3" /> Terkonfigurasi
              </Badge>
            )}
          </div>
        </CardBody>
      </Card>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary-500" /> Panduan Mendapatkan API Key
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(Object.entries(PROVIDERS) as [string, { label: string; base: string; models: string[] }][]).map(([id, info]) => (
            <div key={id} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
              <p className="font-semibold text-sm">{info.label}</p>
              <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                {id === 'gemini' && (
                  <>
                    <li>Buka <span className="font-mono text-primary-500">aistudio.google.com/app/apikey</span></li>
                    <li>Login Google - Buat API key</li>
                    <li>Gratis: 1.500 request/hari</li>
                  </>
                )}
                {id === 'openrouter' && (
                  <>
                    <li>Daftar di <span className="font-mono text-primary-500">openrouter.ai</span></li>
                    <li>Dashboard - API Keys - Create</li>
                    <li>Multi-model: GPT, Gemini, Llama</li>
                  </>
                )}
                {id === 'groq' && (
                  <>
                    <li>Daftar di <span className="font-mono text-primary-500">console.groq.com</span></li>
                    <li>Settings - API Keys - Create</li>
                    <li>Gratis: 60 RPM, model cepat</li>
                  </>
                )}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

