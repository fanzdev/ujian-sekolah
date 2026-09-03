import { useEffect, useState } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { Database, Plus, Pencil, Trash2, FolderOpen, HelpCircle, Tag } from 'lucide-react'
import { useAsync, useDebounce, useDocumentTitle } from '@/hooks/useAsync'
import { useToast } from '@/hooks/useToast'
import { useConfirm } from '@/hooks/useConfirm'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { SearchInput } from '@/components/ui/FormControls'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, ErrorState } from '@/components/ui/Feedback'
import { listBanks, createBank, updateBank, deleteBank, listQuestions, type BankInput } from '@/services/questions.service'
import type { QuestionBank } from '@/types/models'

const STATUS_TONES: Record<string, 'gray' | 'green' | 'amber'> = {
  draft: 'amber',
  published: 'green',
  archived: 'gray',
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draf',
  published: 'Dipublikasi',
  archived: 'Arsip',
}

export default function QuestionBanksPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const debouncedSearch = useDebounce(search)
  useDocumentTitle('Bank Soal')

  const query = useAsync(
    () => listBanks({ search: debouncedSearch || undefined, status: statusFilter || undefined, pageSize: 100 }),
    [debouncedSearch, statusFilter],
  )
  const toast = useToast()
  const confirmDialog = useConfirm()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<QuestionBank | null>(null)

  if (query.error) return <ErrorState message={query.error} onRetry={query.reload} />

  const banks = query.data?.rows ?? []

  const openCreate = () => {
    setEditing(null)
    setEditorOpen(true)
  }
  const openEdit = (bank: QuestionBank) => {
    setEditing(bank)
    setEditorOpen(true)
  }

  const handleDelete = async (bank: QuestionBank) => {
    const ok = await confirmDialog.confirm({
      title: 'Hapus Bank Soal?',
      message: `Seluruh soal dalam bank "${bank.title}" akan ikut terhapus permanen.`,
      danger: true,
      confirmText: 'Hapus',
    })
    if (!ok) return
    try {
      await deleteBank(bank.id)
      toast.success('Bank soal dihapus.')
      query.reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menghapus.')
    }
  }

  return (
    <>
      <PageHeader
        title="Bank Soal"
        subtitle="Kelola koleksi soal untuk ujian"
        icon={<Database className="h-5 w-5" />}
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            Buat Bank Soal
          </Button>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <SearchInput placeholder="Cari judul bank..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select
            className="w-full sm:w-40"
            placeholder="Semua Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: 'draft', label: 'Draf' },
              { value: 'published', label: 'Dipublikasi' },
              { value: 'archived', label: 'Arsip' },
            ]}
          />
        </div>

        {query.loading ? (
          <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-48 animate-pulse rounded-xl border border-slate-100 bg-slate-50 dark:bg-slate-800 dark:text-slate-200" />
            ))}
          </div>
        ) : banks.length === 0 ? (
          <EmptyState
            icon={<Database className="h-6 w-6" />}
            title="Belum ada bank soal"
            description="Buat bank soal pertama untuk mulai menambahkan soal."
            action={<Button size="sm" onClick={openCreate} icon={<Plus className="h-4 w-4" />}>Buat Bank Soal</Button>}
          />
        ) : (
          <BankCardGrid
            banks={banks}
            onEdit={openEdit}
            onDelete={handleDelete}
          />
        )}
      </Card>

      <BankEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        editing={editing}
        onSaved={() => {
          setEditorOpen(false)
          query.reload()
        }}
      />
    </>
  )
}

function BankCardGrid({
  banks,
  onEdit,
  onDelete,
}: {
  banks: QuestionBank[]
  onEdit: (bank: QuestionBank) => void
  onDelete: (bank: QuestionBank) => void
}) {
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({})
  const [loadingCounts, setLoadingCounts] = useState(true)

  useEffect(() => {
    setLoadingCounts(true)
    const bankIds = banks.map((b) => b.id)
    if (bankIds.length === 0) {
      setLoadingCounts(false)
      return
    }

    Promise.all(
      bankIds.map((id) =>
        listQuestions({ bankId: id, pageSize: 1 })
          .then((r) => [id, r.total] as [string, number])
          .catch(() => [id, 0] as [string, number]),
      ),
    )
      .then((results) => {
        const counts: Record<string, number> = {}
        for (const [id, count] of results) {
          counts[id] = count
        }
        setQuestionCounts(counts)
      })
      .finally(() => setLoadingCounts(false))
  }, [banks])

  return (
    <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 animate-fade-in">
      {banks.map((bank) => (
        <Card key={bank.id} className="group relative flex flex-col transition-all hover:shadow-card-hover">
          <div className="flex flex-1 flex-col p-5">
            <div className="flex items-start justify-between gap-2">
              <Link
                to={`./${bank.id}`}
                className="min-w-0 flex-1"
              >
                <h3 className="text-[15px] font-bold leading-snug text-slate-900 transition-colors group-hover:text-primary-600 line-clamp-2 dark:group-hover:text-primary-300">
                  {bank.title}
                </h3>
              </Link>
              <Badge tone={STATUS_TONES[bank.status]}>
                {STATUS_LABELS[bank.status]}
              </Badge>
            </div>

            {bank.description && (
              <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-400">
                {bank.description}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {bank.subjects?.name && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-primary-50 px-2.5 py-1 text-[11px] font-semibold text-primary-700">
                  {bank.subjects.name}
                </span>
              )}
              {bank.grade_level && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                  Kelas {bank.grade_level}
                </span>
              )}
              {bank.tags && bank.tags.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-200">
                  <Tag className="h-3 w-3" />
                  {bank.tags.slice(0, 2).join(', ')}
                  {bank.tags.length > 2 && ` +${bank.tags.length - 2}`}
                </span>
              )}
            </div>

            <div className="mt-auto pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <HelpCircle className="h-3.5 w-3.5" />
                  {loadingCounts ? (
                    <span className="h-3 w-8 animate-pulse rounded bg-slate-200" />
                  ) : (
                    <span>
                      <span className="font-semibold text-slate-600">{questionCounts[bank.id] ?? 0}</span> soal
                    </span>
                  )}
                </div>
                {bank.profiles?.full_name && (
                  <span className="text-[11px] text-slate-400">
                    {bank.profiles.full_name}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 border-t border-slate-100 px-4 py-2.5">
            <Link
              to={`./${bank.id}`}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold text-primary-600 transition-colors hover:bg-primary-50 dark:hover:bg-primary-500/15 dark:text-white"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Kelola Soal
            </Link>
            <button
              onClick={() => onEdit(bank)}
              title="Ubah"
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-500/10 dark:hover:text-sky-400"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => onDelete(bank)}
              title="Hapus"
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </Card>
      ))}
    </div>
  )
}

function BankEditorModal({
  open,
  onClose,
  editing,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  editing: QuestionBank | null
  onSaved: () => void
}) {
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const role = location.pathname.split('/')[1] ?? 'admin'
  const [form, setForm] = useState<BankInput>({
    title: '',
    description: '',
    subject_id: '',
    grade_level: null,
    status: 'draft',
    tags: [],
  })
  const [tagText, setTagText] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm({
      title: editing?.title ?? '',
      description: editing?.description ?? '',
      subject_id: editing?.subject_id ?? '',
      grade_level: editing?.grade_level ?? null,
      status: editing?.status ?? 'draft',
      tags: editing?.tags ?? [],
    })
    setTagText((editing?.tags ?? []).join(', '))
  }, [open, editing])

  const submit = async () => {
    if (!form.title.trim()) {
      toast.error('Judul bank soal wajib diisi.')
      return
    }
    setSaving(true)
    try {
      const payload: BankInput = {
        ...form,
        title: form.title.trim(),
        subject_id: form.subject_id || null,
        tags: tagText.split(',').map((t) => t.trim()).filter(Boolean),
      }
      if (editing) {
        await updateBank(editing.id, payload)
        toast.success('Bank soal diperbarui.')
        onSaved()
      } else {
        const created = await createBank(payload)
        toast.success('Bank soal dibuat. Tambahkan soal sekarang.')
        onSaved()
        navigate(`/${role}/question-banks/${created.id}`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Ubah Bank Soal' : 'Buat Bank Soal'} size="md">
      <div className="space-y-4 px-6 py-5">
        <Input label="Judul" placeholder="cth: Bank Soal Matematika Kelas X" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required autoFocus />
        <Textarea label="Deskripsi" placeholder="Deskripsi singkat isi bank soal" value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <Select
          label="Tingkat Kelas"
          placeholder="Semua tingkat"
          value={form.grade_level ?? ''}
          onChange={(e) => setForm({ ...form, grade_level: e.target.value ? Number(e.target.value) : null })}
          options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `Kelas ${i + 1}` }))}
        />

        <Input label="Tag" placeholder="pisahkan dengan koma, cth: aljabar, geometri" value={tagText} onChange={(e) => setTagText(e.target.value)} hint="Tag memudahkan pencarian soal." />
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4 dark:bg-slate-800 dark:text-slate-200">
        <Button variant="ghost" onClick={onClose}>Batal</Button>
        <Button onClick={submit} loading={saving}>{editing ? 'Simpan Perubahan' : 'Buat & Tambah Soal'}</Button>
      </div>
    </Modal>
  )
}
