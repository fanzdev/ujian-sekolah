-- Fix: Siswa harus bisa upload snapshot kamera untuk monitoring admin
-- Bucket media public, tapi policy lama hanya mengizinkan admin/teacher insert.
-- Tanpa ini, SilentCameraCapture di ExamRunnerPage gagal upload dan LiveCameraWall di admin gelap/kosong.

drop policy if exists "media_insert_staff" on storage.objects;
create policy "media_insert_staff" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and private.my_role() in ('admin', 'teacher')
  );

drop policy if exists "media_insert_snapshot_student" on storage.objects;
create policy "media_insert_snapshot_student" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and private.my_role() = 'student'
    and name like 'exam-snapshot/%'
  );

-- Pastikan select tetap public (sudah ada media_public_read)
-- media_files sudah mengizinkan insert own (owner_id = auth.uid()), jadi siswa bisa insert baris media_files
