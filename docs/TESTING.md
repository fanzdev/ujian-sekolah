# Testing Checklist

## 1. Build & Static

```bash
npm run build        # harus sukses, tanpa TS error
npm run lint         # 0 error
npm run preview      # http://localhost:4173/ujian/
```

- [ ] `dist/404.html` & `dist/.nojekyll` ada.
- [ ] Preview: `/ujian/`, `/ujian/login`, `/ujian/admin/students` (deep link) → semua 200.
- [ ] Tidak ada error console saat first load (tanpa env: tampil halaman SetupRequired, bukan blank).

## 2. Routing

- [ ] Login → redirect ke dashboard sesuai role.
- [ ] Refresh setiap halaman nested → tetap di halaman yang sama (bukan 404).
- [ ] Akses `/ujian/admin` sebagai siswa/guru → dialihkan ke home masing-masing.
- [ ] Logout → `/ujian/login`; back button tidak membuka dashboard lagi.
- [ ] URL tak dikenal → halaman 404 dalam layout.

## 3. Auth

- [ ] Login username salah / password salah → pesan jelas.
- [ ] Akun dinonaktifkan admin → login ditolak dengan pesan.
- [ ] Ganti password (Profil → Keamanan) → logout, login password baru OK; password lama gagal.

## 4. Database & RLS (Security Test)

Login sebagai **siswa**:
- [ ] Buka DevTools Network — tidak ada payload berisi `is_correct` / `default_answer` selama ujian.
- [ ] Query manual via supabase-js console: `.from('exams').select()` → array kosong (ditolak RLS).
- [ ] `.from('answers').select()` milik siswa lain → kosong.
- [ ] `.from('audit_logs').select()` → kosong.

Login sebagai **guru**:
- [ ] Hanya melihat ujian/bank soal miliknya (+ bank published read-only).
- [ ] Tidak bisa menghapus akun siswa (tombol tidak ada; API pun ditolak).

## 5. Exam End-to-End (uji 3 akun)

Persiapan admin: buat kelas+siswa, guru membuat bank soal (6 tipe), ujian (acak ON, PIN ON, limit pelanggaran 3), target kelas → publish.

Siswa:
- [ ] Ujian muncul di daftar sesuai kelas/jurusan.
- [ ] PIN salah → ditolak; PIN benar + konfirmasi integritas → attempt dibuat.
- [ ] Jawab semua tipe soal; badge status autosave berganti Saving→Saved.
- [ ] Refresh browser → urutan soal & jawaban sama (lanjut attempt).
- [ ] Putus internet (DevTools offline) → jawab beberapa soal → status Offline → online kembali → tersinkron, tanpa duplikat.
- [ ] Pindah tab 3× → warning naik bertingkat → auto-submit pada ke-3.
- [ ] Ulangi ujian lain: biarkan timer habis → auto-submit otomatis.
- [ ] Submit manual → layar sukses; attempt terkunci; nilai objektif tampil bila dikonfigurasi.

Guru/Admin:
- [ ] Monitoring peserta menampilkan status real-time-ish (refresh/auto).
- [ ] Violation Log berisi entri tab_switch dsb.
- [ ] Hasil ujian: skor objektif benar sesuai kunci & bobot (cek manual PGK parsial, isian variasi kapital/spasi, menjodohkan).
- [ ] Essay: AI suggestion (bila dikonfigurasi) → override nilai final → nilai akhir & kelulusan ikut ter-update.
- [ ] Export CSV/Excel/PDF hasil unduh dan isinya benar.

## 6. Import

- [ ] Unduh template siswa, isi 3 baris (1 sengaja invalid) → pratinjau menandai error baris tsb.
- [ ] Import → progress selesai; akun bisa login; siswa masuk kelas target.
- [ ] Import file sama dua kali → duplikat ditolak dengan laporan.

## 7. GitHub Pages Test (pasca-deploy)

- [ ] Homepage, login, dashboard, CSS, JS chunk, gambar/logo, favicon → tanpa 404 / Failed to load resource.
- [ ] Supabase connect OK dari domain Pages.
- [ ] Refresh nested route OK; mobile Chrome & Safari dicoba.
