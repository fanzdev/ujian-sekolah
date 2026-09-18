const fs = require('fs');

const content = `import { useState } from "react"
import { Bot, Sparkles, FileText, GraduationCap, Pencil, Brain, CheckCircle2, Loader2 } from "lucide-react"
import { useDocumentTitle } from "@/hooks/useAsync"
import { useToast } from "@/hooks/useToast"
import { Button } from "@/components/ui/Button"
import { Input, Textarea, Select } from "@/components/ui/Input"
import { Card, CardBody } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { veyraGenerateQuestions, veyraBuildExplanation, veyraGradeEssay, veyraBuildRemedial, VeyraAiError, type VeyraGeneratedQuestion } from "@/services/veyra-ai.service"
import { suggestEssayScore, buildExamRecap, buildExplanationDraft } from "@/services/local-assist.service"
import type { Difficulty, QuestionType } from "@/types/models"

type Tab = "generate" | "explain" | "grade" | "analyze" | "remedial"

const TABS = [
  { id: "generate" as Tab, label: "Generator Soal", icon: Sparkles },
  { id: "explain" as Tab, label: "Pembahasan", icon: FileText },
  { id: "grade" as Tab, label: "Nilai Esai", icon: Pencil },
  { id: "analyze" as Tab, label: "Analisis Ujian", icon: Brain },
  { id: "remedial" as Tab, label: "Soal Remedial", icon: GraduationCap },
]

const LETTERS = ["A", "B", "C", "D", "E", "F"]

export default function VeyraAiPage() {
  useDocumentTitle("Veyra AI - Asisten Guru")
  const toast = useToast()
  const [activeTab, setActiveTab] = useState<Tab>("generate")

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Bot className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Veyra AI</h1>
          <p className="text-sm text-muted-foreground">Asisten AI untuk guru dan admin SMK AL-FATA</p>
        </div>
        <Badge tone="gray">Lokal + Cloud fallback</Badge>
      </div>
      <div className="flex gap-1 p-1 bg-muted rounded-lg overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={"flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap " + (activeTab === tab.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-background/50")}>
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>
      <Card className="border-0 p-6">
        <CardBody className="p-0">
          {activeTab === "generate" && <GenerateTab />}
          {activeTab === "explain" && <ExplainTab />}
          {activeTab === "grade" && <GradeTab />}
          {activeTab === "analyze" && <AnalyzeTab />}
          {activeTab === "remedial" && <RemedialTab />}
        </CardBody>
      </Card>
    </div>
  )
}

function GenerateTab() {
  const toast = useToast()
  const [subject, setSubject] = useState("")
  const [gradeLevel, setGradeLevel] = useState("")
  const [material, setMaterial] = useState("")
  const [count, setCount] = useState(5)
  const [type, setType] = useState("mixed")
  const [difficulty, setDifficulty] = useState("mixed")
  const [generating, setGenerating] = useState(false)
  const [items, setItems] = useState<VeyraGeneratedQuestion[] | null>(null)

  const run = async () => {
    if (subject.trim() === "") { toast.error("Mata pelajaran wajib diisi."); return }
    if (material.trim().length < 10) { toast.error("Materi minimal 10 karakter."); return }
    setGenerating(true); setItems(null)
    try {
      const result = await veyraGenerateQuestions({ subject: subject.trim(), gradeLevel: gradeLevel.trim(), material: material.trim(), count, type, difficulty })
      setItems(result)
      toast.success("Soal berhasil dibuat.")
    } catch (err) {
      if (err instanceof VeyraAiError && err.kind === "unavailable") {
        toast.info("Mode lokal aktif.")
        setItems(generateLocalQuestions(subject, gradeLevel, material, count, type, difficulty))
      } else { toast.error(err instanceof Error ? err.message : "Gagal membuat soal.") }
    } finally { setGenerating(false) }
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
      <Button onClick={run} disabled={generating}>{generating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}{generating ? "Membuat..." : "Buat Soal dengan Veyra AI"}</Button>
      {items && items.length > 0 && (
        <div className="space-y-3 mt-4">
          <p className="text-sm text-muted-foreground">{items.length} soal berhasil dibuat</p>
          {items.map((q, i) => (
            <Card key={i} className="p-4 space-y-2">
              <div className="flex items-start gap-3">
                <Badge tone="blue">Soal {i + 1}</Badge>
                <div className="flex-1 min-w-0"><p className="font-medium text-sm">{q.question}</p><p className="text-xs text-muted-foreground mt-1">Jawaban: {q.correctAnswer} | {q.explanation}</p></div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function generateLocalQuestions(_subject: string, _grade: string, material: string, count: number, _type: QuestionType | "mixed", difficulty: Difficulty | "mixed"): VeyraGeneratedQuestion[] {
  return Array.from({ length: Math.min(count, 5) }, (_, i) => ({
    type: "multiple_choice" as QuestionType,
    question: "[Soal Lokal " + (i + 1) + "] " + material.slice(0, 50) + "...",
    options: ["Opsi A", "Opsi B", "Opsi C", "Opsi D"],
    pairs: null,
    correctAnswer: "A",
    explanation: "Penjelasan draf lokal. Guru perlu meninjau ulang.",
    difficulty: difficulty === "mixed" ? "medium" : difficulty,
    topic: material.slice(0, 80),
  }))
}

function ExplainTab() {
  const toast = useToast()
  const [questionText, setQuestionText] = useState("")
  const [optionsText, setOptionsText] = useState<string[]>(["", "", "", ""])
  const [correctAnswer, setCorrectAnswer] = useState("A")
  const [type, setType] = useState<QuestionType>("multiple_choice")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const run = async () => {
    if (questionText.trim().length < 10) { toast.error("Soal minimal 10 karakter."); return }
    setLoading(true); setResult(null)
    try {
      const res = await veyraBuildExplanation({ questionText: questionText.trim(), type, optionsText: optionsText.filter(Boolean), correctAnswer })
      setResult(res)
    } catch (err) {
      if (err instanceof VeyraAiError && err.kind === "unavailable") {
        setResult(buildExplanationDraft({ questionText: questionText.trim(), type, optionsText: optionsText.filter(Boolean), correctAnswer }))
      } else { toast.error(err instanceof Error ? err.message : "Gagal.") }
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2"><label className="label-base">Soal</label><Textarea value={questionText} onChange={(e) => setQuestionText(e.target.value)} rows={3} placeholder="Tulis soal di sini..." /></div>
      {(type === "multiple_choice" || type === "multiple_response") && (
        <div className="space-y-2">
          <label className="label-base">Pilihan</label>
          <div className="space-y-2">
            {optionsText.map((opt, i) => (
              <Input key={i} value={opt} onChange={(e) => { const next = [...optionsText]; next[i] = e.target.value; setOptionsText(next); }} placeholder={"Opsi " + LETTERS[i]} />
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><label className="label-base">Tipe</label><Select options={[{value:"multiple_choice",label:"Pilihan Ganda"},{value:"multiple_response",label:"PG Kompleks"},{value:"true_false",label:"Benar/Salah"},{value:"short_answer",label:"Isian Singkat"}]} value={type} onChange={(e) => setType(e.target.value as QuestionType)} /></div>
        <div className="space-y-2"><label className="label-base">Kunci Jawaban</label>
          {type === "true_false"
            ? <Select options={[{value:"Benar",label:"Benar"},{value:"Salah",label:"Salah"}]} value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} />
            : <Select options={LETTERS.map(l => ({value: l, label: l}))} value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} />
          }
        </div>
      </div>
      <Button onClick={run} disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}{loading ? "Memproses..." : "Buat Pembahasan"}</Button>
      {result && <div className="mt-4 p-4 bg-muted rounded-lg"><p className="text-sm whitespace-pre-wrap">{result}</p></div>}
    </div>
  )
}

function GradeTab() {
  const toast = useToast()
  const [questionText, setQuestionText] = useState("")
  const [answerText, setAnswerText] = useState("")
  const [maxScore, setMaxScore] = useState(100)
  const [rubric, setRubric] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ score: number; feedback: string } | null>(null)

  const run = async () => {
    if (answerText.trim().length < 10) { toast.error("Jawaban minimal 10 karakter."); return }
    setLoading(true); setResult(null)
    try {
      const res = await veyraGradeEssay({ questionText: questionText.trim(), answerText: answerText.trim(), maxScore, rubric: rubric.trim() })
      setResult({ score: res.score, feedback: res.feedback })
    } catch (err) {
      if (err instanceof VeyraAiError && err.kind === "unavailable") {
        const local = suggestEssayScore({ questionText: questionText.trim(), answerText: answerText.trim(), maxScore, rubric: rubric.trim() || undefined })
        setResult({ score: local.score, feedback: local.feedback })
      } else { toast.error(err instanceof Error ? err.message : "Gagal.") }
    } finally { setLoading(false) }
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
      {result && <div className="mt-4 p-4 bg-muted rounded-lg space-y-2"><div className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-green-500" /><span className="font-semibold">Skor: {result.score} / {maxScore}</span></div><p className="text-sm text-muted-foreground">{result.feedback}</p></div>}
    </div>
  )
}

function AnalyzeTab() {
  const toast = useToast()
  const [examTitle, setExamTitle] = useState("")
  const [scoresStr, setScoresStr] = useState("")
  const [passingGrade, setPassingGrade] = useState(75)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const run = async () => {
    const scores = scoresStr.split(/[,;\\s]+/).map(Number).filter((n) => Number.isFinite(n) && n >= 0)
    if (scores.length === 0) { toast.error("Masukkan minimal 1 nilai."); return }
    setLoading(true); setResult(null)
    try {
      const recap = buildExamRecap({ examTitle: examTitle.trim(), scores, passingGrade, distribution: [], lowQuestions: [] })
      setResult(recap.summary)
    } catch { toast.error("Gagal menganalisis.") } finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2"><label className="label-base">Nama Ujian</label><Input value={examTitle} onChange={(e) => setExamTitle(e.target.value)} placeholder="contoh: UTS Pemrograman Web" /></div>
      <div className="space-y-2"><label className="label-base">Nilai Peserta (pisahkan koma/spasi)</label><Textarea value={scoresStr} onChange={(e) => setScoresStr(e.target.value)} rows={3} placeholder="85 90 78 65 88..." /></div>
      <div className="space-y-2"><label className="label-base">KKM</label><Input type="number" value={passingGrade} onChange={(e) => setPassingGrade(Number(e.target.value))} min={0} max={100} /></div>
      <Button onClick={run} disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Brain className="w-4 h-4 mr-2" />}{loading ? "Menganalisis..." : "Analisis dengan Veyra AI"}</Button>
      {result && <div className="mt-4 p-4 bg-muted rounded-lg"><p className="text-sm whitespace-pre-wrap">{result}</p></div>}
    </div>
  )
}

function RemedialTab() {
  const toast = useToast()
  const [material, setMaterial] = useState("")
  const [weakPoints, setWeakPoints] = useState("")
  const [count, setCount] = useState(5)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const run = async () => {
    if (material.trim().length < 10) { toast.error("Materi minimal 10 karakter."); return }
    setLoading(true); setResult(null)
    try {
      const res = await veyraBuildRemedial({ material: material.trim(), weakPoints: weakPoints.trim(), count })
      setResult(res)
    } catch (err) {
      if (err instanceof VeyraAiError && err.kind === "unavailable") {
        setResult("Soal remedial untuk materi \"" + material.trim() + "\". Fokus pada poin kelemahan: " + (weakPoints.trim() || "umum") + ". Buat " + count + " soal latihan tambahan.")
      } else { toast.error(err instanceof Error ? err.message : "Gagal.") }
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2"><label className="label-base">Materi Pokok</label><Textarea value={material} onChange={(e) => setMaterial(e.target.value)} rows={2} placeholder="Materi yang perlu diremedial..." /></div>
      <div className="space-y-2"><label className="label-base">Poin Lemah (opsional)</label><Input value={weakPoints} onChange={(e) => setWeakPoints(e.target.value)} placeholder="Konsep yang sering salah..." /></div>
      <div className="space-y-2"><label className="label-base">Jumlah Soal</label><Select options={[1,2,3,5,10].map(n => ({value: String(n), label: String(n)}))} value={String(count)} onChange={(e) => setCount(Number(e.target.value))} /></div>
      <Button onClick={run} disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <GraduationCap className="w-4 h-4 mr-2" />}{loading ? "Membuat..." : "Buat Soal Remedial"}</Button>
      {result && <div className="mt-4 p-4 bg-muted rounded-lg"><p className="text-sm whitespace-pre-wrap">{result}</p></div>}
    </div>
  )
}
`

fs.writeFileSync('src/pages/shared/VeyraAiPage.tsx', content, 'utf8')
console.log('Written', content.length, 'bytes to VeyraAiPage.tsx')
