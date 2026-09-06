-- ============================================================
-- SMK AL-FATA CBT — Migration 00021: Fix avatar upload ke Storage
-- Semua upload file (avatar, logo, soal media, snapshot) wajib via
-- Supabase Storage bucket 'media' agar tidak membebani aplikasi.
-- Policy sebelumnya hanya izinkan admin/teacher insert, sehingga
-- siswa gagal upload foto profil (avatars/).
-- ============================================================

-- Izinkan semua user ter-login upload ke folder avatars/
drop policy if exists "media_insert_avatar" on storage.objects;
create policy "media_insert_avatar" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'avatars'
  );

-- Izinkan semua user ter-login upload ke folder logo/ (admin saja yang bisa lewat UI, tapi policy longgar tidak masalah)
drop policy if exists "media_insert_logo" on storage.objects;
create policy "media_insert_logo" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'logo'
  );

-- Pastikan snapshot siswa tetap bisa (sudah ada di 00020, tapi re-apply agar idempotent)
drop policy if exists "media_insert_snapshot_student" on storage.objects;
create policy "media_insert_snapshot_student" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and private.my_role() = 'student'
    and name like 'exam-snapshot/%'
  );

-- Staff tetap bisa upload ke semua folder question-* dan umum
drop policy if exists "media_insert_staff" on storage.objects;
create policy "media_insert_staff" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and private.my_role() in ('admin', 'teacher')
  );

-- Public read tetap
drop policy if exists "media_public_read" on storage.objects;
create policy "media_public_read" on storage.objects for select
  using (bucket_id = 'media');
