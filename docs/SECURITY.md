# Security Notes

## Ancaman & Mitigasi

| Ancaman | Mitigasi |
|---|---|
| XSS | DOMPurify whitelist tag/attr untuk semua konten rich; tidak ada `eval`/`innerHTML` mentah |
| SQL Injection | Semua query via supabase-js parameterized / plpgsql bind |
| Privilege escalation | RLS per tabel + trigger `guard_profile_update` + verifikasi role di kedua Edge Function |
| IDOR (akses data orang lain) | Policy selalu membandingkan `auth.uid()` ↔ `profile_id/student_id` atau kepemilikan ujian |
| Answer key leak | Kunci tidak pernah dikirim: RPC definer memfilter kolom; siswa tanpa policy langsung |
| Timer manipulation | Deadline di DB; countdown pakai offset waktu server; submit divalidasi server-side |
| Duplicate submission | `FOR UPDATE` lock + cek status `in_progress` di `submit_attempt` |
| Replay autosave | Upsert idempotent PK `(attempt_id, question_id)` |
| Secret bocor | Hanya anon key di frontend; `.env` di gitignore; workflow membaca dari GitHub Secrets |
| Session abuse | Ban user nonaktif via auth admin API; audit log login/logout |
| Penyalahgunaan wipe total | RPC `wipe_everything_reset_setup` hanya bisa dipanggil admin terautentikasi (guard `auth.uid()` + `is_admin()`); wizard `/setup` hanya terbuka setelah flag direset oleh RPC tersebut |

## Batasan yang Jujur

- Browser tidak dapat mencegah curang 100%. Deteksi tab-switch/blur/fullscreen adalah *indikator*, bukan pembuktian.
- Kamera adalah preview monitoring dengan izin pengguna; snapshot tersimpan hanya bila diaktifkan admin (kebijakan privasi sekolah berlaku).
- IP publik siswa tidak reliabel dari stack ini; kolom metadata diisi best-effort.

## Checklist Operasional Admin

- [ ] Ganti password default admin pertama segera setelah login.
- [ ] Nonaktifkan (ban) akun lulusan/alumni.
- [ ] Tinjau Audit Log & Violation Log secara berkala.
