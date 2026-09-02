# AGENTS.md — Aturan Akses File untuk AI Agent

> **File ini adalah kontrak kerja untuk AI Agent** (Claude, Copilot, Cursor, dll.)
> yang bekerja pada repositori SMK AL-FATA CBT.
> **Prioritas: instruksi pengguna > file ini.** Jika instruksi pengguna meminta
> mengakses area yang dibatasi di sini, ikuti pengguna — tapi lakukan dengan hati-hati.

---

## 1. Ringkasan Proyek

- **Jenis**: Sistem Ujian CBT sekolah (production, bukan demo)
- **Frontend**: React 18 + Vite 5 + TypeScript strict + Tailwind CSS (path alias `@/ → src/`)
- **Backend**: Supabase (Auth, Postgres + RLS, Storage, Edge Functions Deno)
- **Target deploy**: GitHub Pages, base path `/ujian/`

## 2. Zona Akses Berdasarkan Jenis Tugas

### ✅ Tugas UI / Komponen / Halaman
```
src/components/**        src/pages/**            src/hooks/**
src/features/**          src/routes/index.tsx    src/lib/utils.ts
src/lib/constants.ts     src/lib/datetime.ts     src/index.css
tailwind.config.js
```

### ✅ Tugas Data / Service / Integrasi Supabase
```
src/services/**          src/types/models.ts     src/lib/errors.ts
src/hooks/useAsync.ts
```

### ✅ Tugas Mesin Ujian (exam engine)
```
src/features/exam/**     src/services/attempts.service.ts
src/components/exam/**   src/pages/exam/**
supabase/migrations/00002_functions.sql   ← hanya jika logika server terkait & WAJIB konfirmasi user dulu
```

### ✅ Tugas Dokumentasi
```
README.md                docs/**                 AGENTS.md (file ini)
```

## 3. 🚫 DILARANG Mengakses / Mengubah Tanpa Instruksi Eksplisit Pengguna

| Path | Alasan |
|---|---|
| `supabase/migrations/00001–00008*.sql` | Skema produksi + RLS; perubahan salah = kebocoran data. Selalu minta konfirmasi & sediakan migrasi BARU (jangan edit migrasi lama yang sudah dijalankan user, kecuali diminta) |
| `supabase/functions/_shared/cors.ts` | Dipakai semua functions bersama |
| `.env`, `.env.example` | Berisi pola kredensial; jangan pernah menaruh secret nyata di dalamnya |
| `.github/workflows/deploy.yml` | Salah = situs production down |
| `dist/**`, `node_modules/**` | Generated — jangan baca/edit/commit |
| `package-lock.json` | Hanya berubah via `npm install`, jangan edit manual |
| `public/logo.svg`, `public/favicon.svg` | Branding resmi sekolah |
| `scripts/create-admin.sql` | Script bootstrap sensitif |
| `index.html` (bagian skrip redirect) | Kritikal untuk GitHub Pages routing |

## 4. Definisi "Selesai" (WAJIB sebelum claim done)

```bash
npm run typecheck   # 0 error
npm run lint        # 0 error
npm run build       # sukses penuh
```
Ketiganya hijau baru boleh menyatakan tugas selesai.

## 5. Konvensi Kode

- ❌ **Tanpa komentar** di kode TS/TSX (nama variabel harus self-explanatory)
- 🇮🇩 Semua teks UI untuk pengguna akhir dalam **Bahasa Indonesia**
- ♿ Ikuti pattern aksesibilitas existing: `aria-label` pada icon-button, semantic HTML, focus-visible ring
- 🎨 Gunakan komponen dari `src/components/ui/` — jangan membuat ulang Button/Input/Modal
- 🌓 Setiap permukaan baru wajib aman dark mode (manfaatkan override global `html.dark` di index.css; hindari warna hardcoded selain token slate/primary/badge)
- ⏰ Waktu ditampilkan zona **Asia/Jakarta** via helper `lib/datetime.ts` (jangan buat formatter sendiri)
- 🔒 Jangan pernah me-render data kunci jawaban (`is_correct`, `default_answer`) di konteks siswa
- 📦 Tidak menambah dependency baru tanpa persetujuan pengguna

## 6. Pola yang Harus Diikuti

| Butuh | Pakai |
|---|---|
| Fetch data async | `useAsync(fn, deps)` dari `@/hooks/useAsync` |
| Notifikasi toast | `useToast()` |
| Konfirmasi aksi destruktif | `useConfirm().confirm({...})` — wajib untuk delete |
| Judul halaman | `useDocumentTitle()` |
| Format angka/tanggal | `lib/utils.ts` / `lib/datetime.ts` |
| Query supabase | lewat service di `src/services/` (jangan panggil `supabase.from` langsung dari komponen, kecuali query dashboard read-only seperti existing pattern) |

## 7. Checklist Sebelum Membuat PR / Menyerahkan Hasil

- [ ] Semua file yang diedit masih dalam zona akses sesuai jenis tugas (bagian 2), ATAU ada instruksi eksplisit user
- [ ] `typecheck` + `lint` + `build` hijau
- [ ] Tidak ada komentar kode baru
- [ ] Tidak ada secret/API key yang tertulis di file apa pun
- [ ] Dark mode tidak rusak pada layar yang disentuh
- [ ] Responsif mobile ≥ 360px tidak berantakan
