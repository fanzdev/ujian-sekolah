-- ============================================================
-- SMK AL-FATA CBT — Migration 00005: Storage + System Defaults
-- CATATAN: TIDAK ADA data dummy/demo sama sekali.
-- Data nyata (jurusan, kelas, mata pelajaran) dibuat oleh ADMIN
-- melalui aplikasi setelah login pertama.
-- ============================================================

-- ---------- Storage bucket ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 52428800)
on conflict (id) do nothing;

drop policy if exists "media_public_read" on storage.objects;
create policy "media_public_read" on storage.objects for select
  using (bucket_id = 'media');

drop policy if exists "media_insert_staff" on storage.objects;
create policy "media_insert_staff" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and private.my_role() in ('admin', 'teacher'));

drop policy if exists "media_update_owner" on storage.objects;
create policy "media_update_owner" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (private.is_admin() or owner = auth.uid()))
  with check (bucket_id = 'media');

drop policy if exists "media_delete_owner_or_admin" on storage.objects;
create policy "media_delete_owner_or_admin" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (private.is_admin() or owner = auth.uid()));

-- ---------- School branding (baris tunggal, nilai default bisa diganti admin) ----------
insert into public.school_settings (id) values (true) on conflict (id) do nothing;

-- ---------- Default pengaturan sistem (konfigurasi, bukan data bisnis) ----------
insert into public.system_settings (key, value) values
  ('exam_defaults', '{
    "duration_minutes": 60,
    "max_attempts": 1,
    "violation_limit": 3,
    "auto_submit_on_limit": true,
    "shuffle_questions": true,
    "shuffle_options": true,
    "fullscreen_required": false,
    "camera_monitoring": false,
    "show_result_to_student": true,
    "show_answers_after": false,
    "passing_grade": 0
  }'),
  ('security', '{ "camera_snapshots_enabled": false, "ip_logging": true, "device_logging": true }'),
  ('password_policy', '{ "min_length": 8 }'),
  ('username_policy', '{ "lowercase": true, "pattern": "^[a-z0-9._-]{3,30}$" }')
on conflict (key) do nothing;
