-- ============================================================
-- SMK AL-FATA CBT — Migration 00036: Full Wipe + Reset Setup
-- Perbaikan: "Hapus Total" (termasuk admin) sebelumnya TIDAK
-- membuka kembali wizard /setup karena:
--   1) RPC admin_delete_user menolak menghapus akun admin yang
--      sedang login, sehingga selalu ada 1 admin tersisa;
--   2) flag permanen system_settings.setup_completed tidak
--      pernah direset.
-- RPC ini menghapus SELURUH data (semua user termasuk admin
-- yang sedang login) lalu me-reset flag setup dalam SATU
-- transaksi atomik, sehingga wizard /setup tampil kembali.
--
-- KEAMANAN: sengaja TIDAK bisa dipanggil via anon. Eksekusi
-- dibatasi untuk authenticated yang terbukti admin SAAT
-- pemanggilan (divalidasi sebelum menghapus apa pun).
-- ============================================================

-- ---------- Perbaikan sekali jalan untuk database yang terlanjur terkunci ----------
-- Filosofi sama dengan 00007: flag mengikuti kenyataan.
--   - Masih ada admin            → flag tetap done (wizard terkunci).
--   - Tidak ada admin sama sekali (mis. habis Hapus Total versi lama)
--     → flag dibuka, wizard /setup tampil lagi.
insert into public.system_settings (key, value)
values (
  'setup_completed',
  jsonb_build_object('done', exists (select 1 from public.profiles where role = 'admin'))
)
on conflict (key) do update
  set value     = jsonb_build_object('done', exists (select 1 from public.profiles where role = 'admin')),
      updated_at = now();

create or replace function public.wipe_everything_reset_setup()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, private, extensions
as $$
declare
  v_caller uuid;
  v_is_admin boolean;
  v_profiles_deleted int;
begin
  v_caller := auth.uid();

  -- ---------- Guard: hanya admin yang masih terautentikasi ----------
  if v_caller is null then
    raise exception 'Hanya admin yang diizinkan menjalankan wipe total.';
  end if;

  select private.is_admin() into v_is_admin;
  if not coalesce(v_is_admin, false) then
    raise exception 'Hanya admin yang diizinkan menjalankan wipe total.';
  end if;

  -- ---------- Bersihkan tabel dengan FK ke profiles/exams dulu ----------
  delete from public.security_events;
  delete from public.exam_violations;
  delete from public.exam_results;
  delete from public.essay_grades;
  delete from public.answers;
  delete from public.exam_attempts;
  delete from public.exam_questions;
  delete from public.exam_participants;
  delete from public.exam_targets;
  delete from public.exams;
  delete from public.questions;
  delete from public.matching_pairs;
  delete from public.question_options;
  delete from public.question_banks;
  delete from public.teacher_subjects;
  delete from public.subjects;
  delete from public.schedules;
  delete from public.students;
  delete from public.teachers;
  delete from public.classes;
  delete from public.departments;
  delete from public.notifications;
  delete from public.audit_logs;
  delete from public.media_files;

  -- ---------- Hapus SEMUA akun auth (termasuk admin yang login) ----------
  -- profiles & students cascade dari auth.users.
  delete from public.profiles;
  delete from auth.users;

  get diagnostics v_profiles_deleted = row_count;

  -- ---------- Reset flag setup agar wizard /setup tampil lagi ----------
  insert into public.system_settings (key, value)
  values ('setup_completed', jsonb_build_object('done', false))
  on conflict (key) do update
    set value = jsonb_build_object('done', false), updated_at = now();

  return jsonb_build_object('ok', true, 'profiles_deleted', v_profiles_deleted);
end $$;

revoke all on function public.wipe_everything_reset_setup() from public, anon;
grant execute on function public.wipe_everything_reset_setup() to authenticated;

comment on function public.wipe_everything_reset_setup() is
  'Wipe total satu kali: hapus seluruh data + semua akun (termasuk admin yang login), lalu reset flag setup_completed sehingga wizard /setup terbuka kembali.';
