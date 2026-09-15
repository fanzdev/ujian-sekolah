-- ============================================================
-- SMK AL-FATA CBT — Migration 00037: Admin Wipe RPC
-- Masalah: hapus via client sering gagal diam-diam karena RLS,
-- dan tabel schedules tidak ikut terhapus saat kelas / ujian /
-- guru dihapus (FK on delete set null), sehingga halaman
-- Jadwal masih menampilkan data setelah "Hapus Semua".
-- Solusi: RPC SECURITY DEFINER khusus admin yang menghapus
-- tuntas termasuk schedules, subjects, dan semua tabel anak.
-- ============================================================

create or replace function public.admin_wipe_schedules()
returns jsonb
language plpgsql volatile security definer set search_path = public, private
as $$
declare
  v_count int;
begin
  if not coalesce(private.is_admin(), false) then
    raise exception 'Hanya admin yang diizinkan menghapus jadwal.';
  end if;
  delete from public.schedules;
  get diagnostics v_count = row_count;
  perform public.log_audit('WIPE_SCHEDULES', 'schedules', null, jsonb_build_object('deleted', v_count));
  return jsonb_build_object('ok', true, 'deleted', v_count);
end $$;

revoke all on function public.admin_wipe_schedules() from public, anon;
grant execute on function public.admin_wipe_schedules() to authenticated;

create or replace function public.admin_wipe_all_keep_me()
returns jsonb
language plpgsql volatile security definer set search_path = public, private
as $$
declare
  v_me uuid := auth.uid();
  v_out jsonb := '{}'::jsonb;
  v_n int;
begin
  if not coalesce(private.is_admin(), false) then
    raise exception 'Hanya admin yang diizinkan menghapus semua data.';
  end if;

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
  get diagnostics v_n = row_count;
  v_out := v_out || jsonb_build_object('exams', v_n);

  delete from public.questions;
  delete from public.matching_pairs;
  delete from public.question_options;
  delete from public.question_banks;
  delete from public.teacher_subjects;
  delete from public.subjects;
  delete from public.schedules;
  get diagnostics v_n = row_count;
  v_out := v_out || jsonb_build_object('schedules', v_n);

  delete from public.classes;
  delete from public.departments;
  delete from public.notifications;
  delete from public.audit_logs;
  delete from public.media_files;

  delete from public.students;

  delete from public.teachers where profile_id is distinct from v_me;

  delete from public.profiles where id is distinct from v_me and role is distinct from 'admin';

  perform public.log_audit('WIPE_ALL_KEEP_ME', 'system', null, v_out);
  return jsonb_build_object('ok', true, 'details', v_out);
end $$;

revoke all on function public.admin_wipe_all_keep_me() from public, anon;
grant execute on function public.admin_wipe_all_keep_me() to authenticated;

create or replace function public.admin_wipe_group(p_group text)
returns jsonb
language plpgsql volatile security definer set search_path = public, private
as $$
declare
  v_me uuid := auth.uid();
  v_n int := 0;
begin
  if not coalesce(private.is_admin(), false) then
    raise exception 'Hanya admin yang diizinkan menghapus data.';
  end if;

  case p_group
    when 'schedules' then
      delete from public.schedules;
      get diagnostics v_n = row_count;
    when 'classes' then
      delete from public.schedules where class_id is not null;
      delete from public.classes;
      get diagnostics v_n = row_count;
    when 'departments' then
      delete from public.schedules;
      delete from public.classes;
      delete from public.departments;
      get diagnostics v_n = row_count;
    when 'teachers' then
      delete from public.schedules where teacher_id is not null;
      delete from public.teachers where profile_id is distinct from v_me;
      get diagnostics v_n = row_count;
    when 'students' then
      delete from public.security_events;
      delete from public.exam_violations;
      delete from public.exam_results;
      delete from public.essay_grades;
      delete from public.answers;
      delete from public.exam_attempts;
      delete from public.students;
      get diagnostics v_n = row_count;
    when 'banks' then
      delete from public.security_events where true;
      delete from public.exam_violations where true;
      delete from public.exam_results where true;
      delete from public.essay_grades where true;
      delete from public.answers where true;
      delete from public.exam_attempts where true;
      delete from public.exam_questions where true;
      delete from public.exam_participants where true;
      delete from public.exam_targets where true;
      delete from public.exams where true;
      delete from public.questions where true;
      delete from public.matching_pairs where true;
      delete from public.question_options where true;
      delete from public.question_banks where true;
      get diagnostics v_n = row_count;
    when 'exams' then
      delete from public.security_events where true;
      delete from public.exam_violations where true;
      delete from public.exam_results where true;
      delete from public.essay_grades where true;
      delete from public.answers where true;
      delete from public.exam_attempts where true;
      delete from public.exam_questions where true;
      delete from public.exam_participants where true;
      delete from public.exam_targets where true;
      delete from public.schedules where true;
      delete from public.exams where true;
      get diagnostics v_n = row_count;
    when 'results' then
      delete from public.exam_results where true;
      delete from public.essay_grades where true;
      delete from public.exam_violations where true;
      delete from public.exam_attempts where true;
      get diagnostics v_n = row_count;
    when 'violations' then
      delete from public.exam_violations where true;
      delete from public.security_events where true;
      get diagnostics v_n = row_count;
    when 'audit' then
      delete from public.audit_logs where true;
      get diagnostics v_n = row_count;
    when 'subjects' then
      delete from public.teacher_subjects where true;
      delete from public.subjects where true;
      get diagnostics v_n = row_count;
    else
      raise exception 'Grup hapus tidak dikenal: %', p_group;
  end case;

  perform public.log_audit('WIPE_GROUP', p_group, null, jsonb_build_object('deleted', v_n));
  return jsonb_build_object('ok', true, 'group', p_group, 'deleted', v_n);
end $$;

revoke all on function public.admin_wipe_group(text) from public, anon;
grant execute on function public.admin_wipe_group(text) to authenticated;
