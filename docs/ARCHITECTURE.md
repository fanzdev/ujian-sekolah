# Arsitektur & Keputusan Teknis

## Prinsip Prioritas (dari requirement)

1. Correctness → 2. Security → 3. Reliability → 4. Performance → 5. Maintainability → 6. UX/UI → 7. Visual

## Stack

| Lapisan | Pilihan | Alasan |
|---|---|---|
| Framework | React 18 + Vite 5 + TS strict | Standar static SPA, build cepat, code-splitting |
| Styling | Tailwind CSS 3 + design token CSS vars | Tanpa runtime JS; warna primary bisa diganti Admin via Settings |
| Routing | React Router 6 `BrowserRouter` basename `/ujian/` | URL bersih; dipasangkan trik `404.html` agar refresh nested route tidak 404 di GH Pages |
| Backend | Supabase (Auth, Postgres, Storage, Edge Functions) | Sesuai requirement, tanpa server sendiri |
| Validasi | zod | Ringan, type-inference |
| Sanitasi | DOMPurify | Semua rich text soal/jawaban |
| Export | SheetJS (xlsx), jsPDF+autotable — **dynamic import** | Excel/PDF nyata tanpa server; hanya dimuat saat dipakai |
| Icons | lucide-react | Tree-shakeable |

Tidak dipakai: Next.js server, Express, PHP, service worker (menghindari cache stale khas GH Pages), realtime subscription massal.

## Model Keamanan

```
Browser siswa ──RPC security-definer──► Postgres
                 (kolom kunci difilter)     │
                                        RLS policies
```

- **RLS = security boundary.** Cek role frontend hanyalah UX.
- Siswa tidak punya policy SELECT pada `questions`, `question_options`, `matching_pairs`, `exams`. Payload ujian disusun fungsi `get_attempt_payload()` yang:
  - memverifikasi pemilik attempt / guru pemilik ujian / admin,
  - mengeluarkan soal sesuai urutan tersimpan (`attempt.question_order`, `option_orders`, `match_orders`) → randomisasi konsisten antar refresh/reconnect,
  - menyembunyikan `is_correct`, `default_answer`, `explanation` selama ujian berjalan.
- Penilaian objektif terjadi di `submit_attempt()` (server). Client tidak pernah menghitung nilai.
- Trigger `guard_profile_update` mencegah user mengubah role/status/username milik siapa pun kecuali admin.
- Edge Function `manage-user` memverifikasi JWT caller adalah admin sebelum memakai service role.

## Mesin Ujian (`useExamEngine`)

State machine attempt: `in_progress → submitted | auto_submitted → graded`; transisi divalidasi di SQL (bukan boolean sederhana).

- **Timer**: `deadline` ditulis saat `start_attempt` = `min(now()+duration, exam.ends_at)`. Client menghitung offset dari `get_server_time()` tiap kali payload dimuat + resync berkala. Manipulasi jam device tidak mempengaruhi.
- **Autosave**: setiap perubahan jawaban masuk antrean dirty-set; flush debounce 800ms + interval 15s + event `online`. Upsert idempotent pada unique `(attempt_id, question_id)` → tidak duplikat. Saat offline: status badge "Offline", backup `sessionStorage`, sinkron otomatis saat online.
- **Auto-submit** saat deadline lewat: client memicu; server tetap memvalidasi ulang (grace 60s) dan menolak save setelah 90s.
- **Pelanggaran**: visibilitychange/blur/fullscreen-exit → RPC `record_violation` (throttle 3s per tipe) → counter & auto-submit dikelola server sehingga tidak bisa dimanipulasi dari console.

## Skala 1000 Siswa

- Index di semua FK/kolom filter; pagination di semua list; `select` spesifik; lazy chunking (xlsx/jspdf hanya termuat saat export).
- Tidak ada realtime global; monitoring peserta memakai polling opsional 30s.
- Fungsi SQL bekerja row-by-row dalam satu transaksi per attempt (biaya O(jumlah_soal)).

## Deviasi Kecil yang Terdokumentasi

1. Status exam disederhanakan `draft/published/completed/cancelled` — "scheduled/active" derivatif dari window waktu (lebih sedikit state salah sinkron).
2. IP address asli browser tidak dapat dibaca dari frontend/Postgres; kolom IP diisi best-effort (metadata), user-agent dicatat via header PostgREST. Didokumentasikan apa adanya demi no-fake-feature.
3. Snapshot kamera hanya aktif bila Admin menyalakan setting `camera_snapshots_enabled` (privasi).
