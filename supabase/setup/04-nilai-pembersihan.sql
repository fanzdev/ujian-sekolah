-- ============================================================
-- SMK AL-FATA CBT - SETUP BAGIAN 04 (00033 s.d. 00043)
-- Isi: Peringkat, nilai otomatis 0-100, wipe admin, healing, default warna
-- Cara pakai: jalankan file 01, 02, 03, 04 BERURUTAN di SQL Editor.
-- Setiap bagian diakhiri pesan konfirmasi BAGIAN_XX_SELESAI.
-- Semua perintah idempotent, aman dijalankan ulang.
-- ============================================================

-- ------------------------------------------------------------
-- SUMBER: 00033_class_ranking.sql
-- ------------------------------------------------------------
-- ============================================================
-- SMK AL-FATA CBT — Migration 00033: Class Ranking per Exam
-- Siswa dapat melihat peringkat teman sekelas dalam satu ujian.
-- ============================================================

create or replace function public.get_exam_class_ranking(p_exam_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  v_uid uuid := auth.uid();
  v_sid uuid;
  v_class uuid;
  v_exam public.exams%rowtype;
  v_result jsonb := '[]'::jsonb;
begin
  select id, class_id into v_sid, v_class from public.students where profile_id = v_uid;

  -- jika bukan siswa, izinkan admin/teacher melihat ranking global
  if v_sid is null then
    if not (private.is_admin() or private.my_teacher_id() is not null) then
      return '[]'::jsonb;
    end if;
    -- untuk teacher/admin: ranking seluruh peserta ujian
    return (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'rank', r.rnk,
          'student_id', r.student_id,
          'student_name', r.full_name,
          'nis', r.nis,
          'class_name', r.class_name,
          'is_me', false,
          'final_score', r.final_score,
          'objective_score', r.objective_score,
          'essay_score', r.essay_score,
          'correct_count', r.correct_count,
          'wrong_count', r.wrong_count,
          'unanswered_count', r.unanswered_count,
          'total_questions', r.total_questions,
          'duration_seconds', r.duration_seconds,
          'violation_count', r.violation_count,
          'passed', r.passed
        ) order by r.rnk, r.full_name
      ), '[]'::jsonb)
      from (
        select
          rank() over (order by coalesce(er.final_score, er.objective_score) desc, er.correct_count desc, er.duration_seconds asc nulls last) as rnk,
          s.id as student_id,
          p.full_name,
          s.nis,
          c.name as class_name,
          er.final_score,
          er.objective_score,
          er.essay_score,
          er.correct_count,
          er.wrong_count,
          er.unanswered_count,
          er.total_questions,
          er.duration_seconds,
          er.violation_count,
          er.passed
        from public.exam_results er
        join public.students s on s.id = er.student_id
        join public.profiles p on p.id = s.profile_id
        left join public.classes c on c.id = s.class_id
        where er.exam_id = p_exam_id
      ) r
    );
  end if;

  select * into v_exam from public.exams where id = p_exam_id;
  if not found then
    return '[]'::jsonb;
  end if;

  if not private.exam_allows_student(p_exam_id, v_sid) then
    -- tetap izinkan melihat jika pernah punya attempt, meski tidak di participants (mis. pindahan kelas)
    if not exists (select 1 from public.exam_attempts where exam_id = p_exam_id and student_id = v_sid) then
      raise exception 'Anda tidak terdaftar pada ujian ini.' using errcode = 'P0001';
    end if;
  end if;

  -- jika siswa tidak punya kelas, hanya kembalikan dirinya sendiri
  if v_class is null then
    return (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'rank', 1,
          'student_id', s.id,
          'student_name', p.full_name,
          'nis', s.nis,
          'class_name', null,
          'is_me', true,
          'final_score', er.final_score,
          'objective_score', er.objective_score,
          'essay_score', er.essay_score,
          'correct_count', er.correct_count,
          'wrong_count', er.wrong_count,
          'unanswered_count', er.unanswered_count,
          'total_questions', er.total_questions,
          'duration_seconds', er.duration_seconds,
          'violation_count', er.violation_count,
          'passed', er.passed
        )
      ), '[]'::jsonb)
      from public.exam_results er
      join public.students s on s.id = er.student_id
      join public.profiles p on p.id = s.profile_id
      where er.exam_id = p_exam_id and s.id = v_sid
    );
  end if;

  -- ranking dalam satu kelas (kelas pemanggil)
  return (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'rank', r.rnk,
        'student_id', r.student_id,
        'student_name', r.full_name,
        'nis', r.nis,
        'class_name', r.class_name,
        'is_me', r.student_id = v_sid,
        'final_score', r.final_score,
        'objective_score', r.objective_score,
        'essay_score', r.essay_score,
        'correct_count', r.correct_count,
        'wrong_count', r.wrong_count,
        'unanswered_count', r.unanswered_count,
        'total_questions', r.total_questions,
        'duration_seconds', r.duration_seconds,
        'violation_count', r.violation_count,
        'passed', r.passed
      ) order by r.rnk, r.full_name
    ), '[]'::jsonb)
    from (
      select
        rank() over (order by coalesce(er.final_score, er.objective_score) desc, er.correct_count desc, er.duration_seconds asc nulls last) as rnk,
        s.id as student_id,
        p.full_name,
        s.nis,
        c.name as class_name,
        er.final_score,
        er.objective_score,
        er.essay_score,
        er.correct_count,
        er.wrong_count,
        er.unanswered_count,
        er.total_questions,
        er.duration_seconds,
        er.violation_count,
        er.passed
      from public.exam_results er
      join public.students s on s.id = er.student_id
      join public.profiles p on p.id = s.profile_id
      left join public.classes c on c.id = s.class_id
      where er.exam_id = p_exam_id
        and s.class_id = v_class
    ) r
  );
end $$;

grant execute on function public.get_exam_class_ranking(uuid) to authenticated;

-- Pastikan recalc_result dipanggil setelah essay grading (sudah ada trigger, tapi pastikan fungsi update juga handle null)
-- Tambahkan helper untuk memastikan nilai final selalu konsisten saat submit tanpa essay
create or replace function public.ensure_result_recalc(p_attempt_id uuid)
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform public.recalc_result(p_attempt_id);
end $$;

grant execute on function public.ensure_result_recalc(uuid) to authenticated;

-- ------------------------------------------------------------
-- SUMBER: 00034_fix_import_results_rls.sql
-- ------------------------------------------------------------
-- ============================================================
-- SMK AL-FATA CBT — Migration 00034: Fix RLS for Import Grades
-- Admin perlu bisa insert/update exam_results via import.
-- ============================================================

drop policy if exists "results_insert_admin" on public.exam_results;
create policy "results_insert_admin" on public.exam_results for insert to authenticated
  with check (private.is_admin());

drop policy if exists "results_update_admin" on public.exam_results;
create policy "results_update_admin" on public.exam_results for update to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- Juga izinkan guru pemilik ujian untuk update nilai (untuk fallback jika RLS membatasi)
drop policy if exists "results_update_owner" on public.exam_results;
create policy "results_update_owner" on public.exam_results for update to authenticated
  using (private.exam_owned_by_me(exam_id))
  with check (private.exam_owned_by_me(exam_id));

-- Pastikan students import juga memperbaiki RLS sebelumnya sudah benar,
-- namun tambahkan kebijakan untuk mengizinkan admin melihat semua hasil walau show_result false (sudah ada)

-- ------------------------------------------------------------
-- SUMBER: 00035_remove_ai.sql
-- ------------------------------------------------------------
-- ============================================================
-- SMK AL-FATA CBT — Migration 00035: Hapus Total Fitur AI
-- Menghapus chat AI, AI grading, laporan AI dari database.
-- Untuk database LAMA yang pernah jalankan 00006_ai_keys.sql.
-- Idempotent: aman dijalankan ulang.
-- ============================================================

-- ---------- 1) Hapus tabel realtime publication AI ----------
do $$ begin
  alter publication supabase_realtime drop table public.ai_provider_keys;
exception when others then null; end $$;

do $$ begin
  alter publication supabase_realtime drop table public.essay_grades;
exception when others then null; end $$;

-- ---------- 2) Hapus pool API key AI (tabel + trigger + policy + index) ----------
drop trigger if exists trg_ai_keys_updated on public.ai_provider_keys;
drop table if exists public.ai_provider_keys;

-- ---------- 3) Membersihkan essay_grades (kolom AI + status) ----------
-- 3a. Konversi sisa status ai_graded -> pending (agar constraint berikut bisa dibentuk)
update public.essay_grades
   set status = 'pending'
 where status = 'ai_graded';

-- 3b. Hapus kolom AI
alter table public.essay_grades
  drop column if exists ai_score,
  drop column if exists ai_feedback,
  drop column if exists ai_confidence,
  drop column if exists ai_provider;

-- 3c. Hapus constraint check yang masih mengandung nilai 'ai_graded'
do $$
declare
  con_name text;
begin
  for con_name in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.essay_grades'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%ai_graded%'
  loop
    execute format('alter table public.essay_grades drop constraint %I', con_name);
  end loop;
end $$;

-- 3d. Pembentukan ulang constraint status hanya pending/graded (idempotent)
alter table public.essay_grades
  drop constraint if exists essay_grades_status_check;
do $$ begin
  alter table public.essay_grades
    add constraint essay_grades_status_check check (status in ('pending', 'graded'));
exception when duplicate_object then null;
end $$;

-- ---------- 4) Hapus konfigurasi AI dari system_settings ----------
delete from public.system_settings where key = 'ai';

-- ---------- 5) Hapus audit trail AI grading (resource 'ai') ----------
delete from public.audit_logs where action = 'GRADE_ESSAY' and resource = 'ai';

-- ------------------------------------------------------------
-- SUMBER: 00036_reset_setup_on_full_wipe.sql
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- SUMBER: 00037_admin_wipe_rpc.sql
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- SUMBER: 00038_auto_scoring_100.sql
-- ------------------------------------------------------------
-- ============================================================
-- SMK AL-FATA CBT — Migration 00038: Bobot Otomatis 0-100
-- Keinginan: 10 soal benar 7 => nilai 70, nilai maksimal 100.
-- Setiap soal berbobot sama: bobot = 100 / total_soal.
-- Skor parsial (PG kompleks / menjodohkan) ikut proporsional.
-- Essay dinilai 0-100 per soal (persentase kebenaran), lalu
-- dikali bobotnya. Kolom points lama diabaikan untuk nilai
-- akhir (tetap disimpan untuk kompatibilitas).
-- ============================================================

create or replace function public.submit_attempt(p_attempt_id uuid, p_auto boolean default false)
returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  v_attempt public.exam_attempts%rowtype;
  v_exam    public.exams%rowtype;
  v_ans     jsonb;
  v_ratio   numeric;
  v_ok      int := 0;
  v_bad     int := 0;
  v_none    int := 0;
  v_obj     numeric := 0;
  v_total_q int := 0;
  v_weight  numeric := 0;
  v_essay_total   int := 0;
  v_essay_graded  int := 0;
  v_essay_score   numeric := 0;
  v_pending       boolean;
  v_final         numeric;
  v_passed        boolean;
  rec       record;
  pr        record;
  v_order   uuid[];
  v_rk      int;
  v_tot     int;
  v_matches int;
begin
  select * into v_attempt from public.exam_attempts where id = p_attempt_id for update;
  if not found then raise exception 'Attempt tidak ditemukan.'; end if;

  if not exists (
    select 1 from public.students s
    where s.id = v_attempt.student_id and s.profile_id = auth.uid()
  ) and not private.is_admin() then
    raise exception 'Akses ditolak.';
  end if;

  if v_attempt.status <> 'in_progress' then
    return jsonb_build_object('already_submitted', true);
  end if;

  select * into v_exam from public.exams where id = v_attempt.exam_id;
  if p_auto is not true and now() > v_attempt.deadline + interval '60 seconds' then
    p_auto := true;
  end if;

  select count(*) into v_total_q
  from public.exam_questions eq where eq.exam_id = v_attempt.exam_id;
  if coalesce(v_total_q, 0) = 0 then
    raise exception 'Ujian belum memiliki soal.';
  end if;
  v_weight := 100.0 / v_total_q;

  for rec in
    select eq.question_id as qid,
           q.type as qtype, q.default_answer, q.scoring_rule
    from public.exam_questions eq
    join public.questions q on q.id = eq.question_id
    where eq.exam_id = v_attempt.exam_id
  loop
    continue when rec.qtype = 'essay';

    select value into v_ans from public.answers
    where attempt_id = p_attempt_id and question_id = rec.qid;

    if v_ans is null or jsonb_typeof(v_ans) = 'null'
       or (rec.qtype in ('short_answer') and coalesce(v_ans #>> '{}', '') = '')
       or (rec.qtype = 'multiple_response' and jsonb_typeof(v_ans) = 'array' and jsonb_array_length(v_ans) = 0) then
      v_none := v_none + 1;
      continue;
    end if;

    begin
      v_ratio := 0;
      if rec.qtype = 'multiple_choice' then
        select case when o.is_correct then 1 else 0 end into v_ratio
        from public.question_options o
        where o.question_id = rec.qid and o.id = (v_ans #>> '{}')::uuid;
        v_ratio := coalesce(v_ratio, 0);

      elsif rec.qtype = 'multiple_response' then
        with sel as (
          select s.value::uuid as oid from jsonb_array_elements_text(v_ans) s(value)
        ),
        tot as (
          select count(*)::int as n from public.question_options
          where question_id = rec.qid and is_correct
        ),
        okc as (
          select count(*)::int as n
          from sel join public.question_options o on o.id = sel.oid and o.is_correct
        ),
        badc as (
          select count(*)::int as n
          from sel join public.question_options o on o.id = sel.oid and not o.is_correct
        )
        select case
                 when tot.n = 0 then 0
                 when coalesce(rec.scoring_rule ->> 'partial', 'false') = 'true'
                   then greatest(0, okc.n - badc.n)::numeric / tot.n
                 else (okc.n = tot.n and badc.n = 0)::int
               end
        into v_ratio from tot, okc, badc;

      elsif rec.qtype = 'true_false' then
        v_ratio := (lower(coalesce(v_ans::text, '')) = lower(coalesce(rec.default_answer ->> 'answer', 'false')))::int;

      elsif rec.qtype = 'short_answer' then
        if coalesce(rec.scoring_rule ->> 'match_mode', 'exact') = 'contains' then
          select exists (
            select 1 from jsonb_array_elements_text(coalesce(rec.default_answer -> 'accepted', '[]'::jsonb)) a(v)
            where position(private.norm_text(a.v) in private.norm_text(v_ans #>> '{}')) > 0
          )::int into v_ratio;
        elsif coalesce(rec.scoring_rule ->> 'match_mode', 'exact') = 'numeric' then
          begin
            v_ratio := (abs((v_ans #>> '{}')::numeric - (coalesce(rec.default_answer -> 'accepted', '[]'::jsonb ->> 0))::numeric)
                        <= coalesce((rec.scoring_rule ->> 'tolerance')::numeric, 0))::int;
          exception when others then v_ratio := 0;
          end;
        else
          select exists (
            select 1
            from jsonb_array_elements_text(coalesce(rec.default_answer -> 'accepted', '[]'::jsonb)) a(v)
            where private.norm_text(a.v) = private.norm_text(v_ans #>> '{}')
          )::int into v_ratio;
        end if;

      elsif rec.qtype = 'matching' then
        select array(select value::uuid
                     from jsonb_array_elements_text(v_attempt.match_orders -> rec.qid::text)) into v_order;
        v_tot := 0; v_matches := 0;
        for pr in
          select mp.id,
                 (row_number() over (order by mp.position)) as rn
          from public.matching_pairs mp where mp.question_id = rec.qid
        loop
          v_tot := v_tot + 1;
          v_rk := coalesce((v_ans ->> pr.rn::text)::int, 0);
          if v_rk between 1 and coalesce(array_length(v_order, 1), 0)
             and v_order[v_rk] = pr.id then
            v_matches := v_matches + 1;
          end if;
        end loop;
        v_ratio := case
                     when v_tot = 0 then 0
                     when coalesce(rec.scoring_rule ->> 'partial', 'false') = 'true'
                       then v_matches::numeric / v_tot
                     else (v_matches = v_tot)::int
                   end;
      end if;
    exception when others then
      v_ratio := 0;
    end;

    v_obj := v_obj + (coalesce(v_ratio, 0) * v_weight);
    if coalesce(v_ratio, 0) >= 1 then v_ok := v_ok + 1; else v_bad := v_bad + 1; end if;
  end loop;

  select count(*) into v_essay_total
  from public.exam_questions eq join public.questions q on q.id = eq.question_id
  where eq.exam_id = v_attempt.exam_id and q.type = 'essay';

  select count(*) into v_essay_graded
  from public.essay_grades g
  where g.attempt_id = p_attempt_id and g.status = 'graded';

  select coalesce(sum(
    (least(100, greatest(0, g.final_score)) / 100.0) * v_weight
  ), 0) into v_essay_score
  from public.essay_grades g
  where g.attempt_id = p_attempt_id and g.status = 'graded';

  v_obj := round(least(100, greatest(0, v_obj)), 2);
  v_essay_score := round(least(100, greatest(0, v_essay_score)), 2);
  v_pending := v_essay_graded < v_essay_total;
  v_final   := round(least(100, v_obj + v_essay_score), 2);
  v_passed  := case when v_pending or v_exam.passing_grade <= 0 then null
                    else v_final >= v_exam.passing_grade end;

  update public.exam_attempts
  set status = (case when p_auto then 'auto_submitted' else 'submitted' end)::public.attempt_status,
      submitted_at = now(),
      last_activity_at = now()
  where id = p_attempt_id;

  insert into public.exam_results (
    attempt_id, exam_id, student_id, total_questions,
    correct_count, wrong_count, unanswered_count,
    objective_score, essay_score, final_score, passed,
    submitted_at, duration_seconds, violation_count
  ) values (
    p_attempt_id, v_attempt.exam_id, v_attempt.student_id,
    v_total_q, v_ok, v_bad, v_none,
    v_obj, case when v_essay_total = 0 then null else v_essay_score end,
    v_final, v_passed,
    now(), extract(epoch from (now() - v_attempt.started_at))::int,
    v_attempt.violation_count
  )
  on conflict (attempt_id) do update set
    total_questions = excluded.total_questions,
    correct_count = excluded.correct_count,
    wrong_count = excluded.wrong_count,
    unanswered_count = excluded.unanswered_count,
    objective_score = excluded.objective_score,
    essay_score = excluded.essay_score,
    final_score = excluded.final_score,
    passed = excluded.passed,
    submitted_at = excluded.submitted_at,
    duration_seconds = excluded.duration_seconds,
    violation_count = excluded.violation_count,
    updated_at = now();

  perform public.log_audit(
    case when p_auto then 'AUTO_SUBMIT' else 'SUBMIT_EXAM' end,
    'exam_attempt', p_attempt_id::text,
    jsonb_build_object('exam_id', v_attempt.exam_id, 'objective_score', v_obj)
  );

  return jsonb_build_object(
    'objective_score', v_obj,
    'correct', v_ok, 'wrong', v_bad, 'unanswered', v_none,
    'essay_total', v_essay_total,
    'essay_graded', v_essay_graded,
    'essay_pending', v_pending,
    'final_score', v_final,
    'passed', v_passed
  );
end $$;

create or replace function public.recalc_result(p_attempt_id uuid)
returns void
language plpgsql volatile security definer set search_path = public, private as $$
declare
  r public.exam_results%rowtype;
  v_exam public.exams%rowtype;
  v_total_q int;
  v_weight numeric;
  v_essay_total int;
  v_essay_graded int;
  v_essay_score numeric;
  v_final numeric;
begin
  select * into r from public.exam_results where attempt_id = p_attempt_id;
  if not found then return; end if;

  select * into v_exam from public.exams where id = r.exam_id;

  select count(*) into v_total_q
  from public.exam_questions where exam_id = r.exam_id;
  v_total_q := greatest(coalesce(v_total_q, 0), 1);
  v_weight := 100.0 / v_total_q;

  select count(*) into v_essay_total
  from public.exam_questions eq join public.questions q on q.id = eq.question_id
  where eq.exam_id = r.exam_id and q.type = 'essay';

  select count(*) into v_essay_graded
  from public.essay_grades g where g.attempt_id = p_attempt_id and g.status = 'graded';

  select coalesce(sum(
    (least(100, greatest(0, g.final_score)) / 100.0) * v_weight
  ), 0) into v_essay_score
  from public.essay_grades where attempt_id = p_attempt_id and status = 'graded';

  v_essay_score := round(least(100, greatest(0, v_essay_score)), 2);
  v_final := round(least(100, coalesce(r.objective_score, 0) + v_essay_score), 2);

  if coalesce(r.objective_score, 0) > 100 then
    update public.exam_results
    set objective_score = round(least(100, greatest(0,
      case when nullif(r.total_questions, 0) is not null and r.total_questions > 0
        then (r.correct_count::numeric / r.total_questions::numeric) * 100
        else 0 end
    )), 2)
    where attempt_id = p_attempt_id
    returning objective_score into r.objective_score;
    v_final := round(least(100, coalesce(r.objective_score, 0) + v_essay_score), 2);
  end if;

  update public.exam_results
  set essay_score = case when v_essay_total = 0 then null else v_essay_score end,
      final_score = v_final,
      total_questions = v_total_q,
      passed = case when v_essay_graded < v_essay_total or v_exam.passing_grade <= 0 then null
                    else v_final >= v_exam.passing_grade end,
      updated_at = now()
  where attempt_id = p_attempt_id;

  if v_essay_graded >= v_essay_total then
    update public.exam_attempts
    set status = 'graded'::public.attempt_status
    where id = p_attempt_id and status in ('submitted'::public.attempt_status, 'auto_submitted'::public.attempt_status);
  end if;
end $$;

-- Normalisasi data lama tanpa essay: nilai = 100 * benar / total
update public.exam_results r
set objective_score = round(
    case when nullif(r.total_questions, 0) is not null
      then (r.correct_count::numeric / r.total_questions::numeric) * 100
      else 0 end, 2),
  final_score = round(
    case when nullif(r.total_questions, 0) is not null
      then (r.correct_count::numeric / r.total_questions::numeric) * 100
      else 0 end, 2),
  updated_at = now()
where r.objective_score > 100
  and not exists (
    select 1 from public.exam_questions eq
    join public.questions q on q.id = eq.question_id
    where eq.exam_id = r.exam_id and q.type = 'essay'
  );

-- ------------------------------------------------------------
-- SUMBER: 00039_healing_konsistensi.sql
-- ------------------------------------------------------------
-- ============================================================
-- SMK AL-FATA CBT - Migration 00039: Healing & Konsistensi
-- Menyembuhkan database lama yang terlanjur menjalankan versi
-- rusak dari migrasi 00019/00031/00032/00035/00038:
--  - get_attempt_payload: record tanpa kolom default_answer
--  - record_security_event: public.is_admin() tidak ada + user_id salah
--  - start_attempt: return uuid + variabel out-of-scope (00032 lama)
--  - submit_attempt/recalc: tanpa cast enum + tanpa bobot 100
--  - essay_grades_status_check: tidak idempotent
-- Idempotent dan aman dijalankan ulang di SQL Editor Supabase.
-- ============================================================

-- ---------- 0) Prasyarat umum ----------
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgcrypto;
create schema if not exists private;
grant usage on schema private to authenticated;
alter table public.exams add column if not exists allow_outside_schedule boolean not null default false;
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 52428800)
on conflict (id) do nothing;

-- ---------- 1) get_attempt_payload (dengan default_answer) ----------
create or replace function public.get_attempt_payload(p_attempt_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  v_attempt public.exam_attempts%rowtype;
  v_exam    public.exams%rowtype;
  v_reveal  boolean;
  v_items   jsonb := '{}'::jsonb;
  v_item    jsonb;
  v_opts    jsonb;
  v_left    jsonb;
  v_right   jsonb;
  rec       record;
  v_stu     record;
begin
  v_attempt := private.load_attempt_checked(p_attempt_id);
  select * into v_exam from public.exams where id = v_attempt.exam_id;
  v_reveal := v_attempt.status in ('submitted', 'auto_submitted', 'graded') and v_exam.show_answers_after;

  for rec in
    select eq.position as pos,
           coalesce(eq.points, q.points) as pts,
           q.id, q.type, q.text, q.media_url, q.media_type,
           q.difficulty, q.scoring_rule, q.default_answer, q.explanation
    from public.exam_questions eq
    join public.questions q on q.id = eq.question_id
    where eq.exam_id = v_attempt.exam_id
  loop
    v_item := jsonb_build_object(
      'id', rec.id, 'type', rec.type, 'text', rec.text,
      'media_url', rec.media_url,
      'media_type', rec.media_type,
      'difficulty', rec.difficulty, 'points', rec.pts
    );

    if rec.type in ('multiple_choice', 'multiple_response') then
      select coalesce(jsonb_agg(
               jsonb_build_object('id', o.id, 'text', o.option_text, 'media_url', o.media_url,
                                  'is_correct', case when v_reveal then o.is_correct end)
               order by j.ord nulls last, o.position),
               '[]'::jsonb)
        into v_opts
        from public.question_options o
        left join lateral (
          select jj.value::uuid as oid, jj.ordinality as ord
          from jsonb_array_elements_text(v_attempt.option_orders -> rec.id::text)
               with ordinality as jj(value, ordinality)
        ) j on j.oid = o.id
        where o.question_id = rec.id;
      v_item := v_item || jsonb_build_object('options', v_opts);

    elsif rec.type = 'matching' then
      select jsonb_agg(jsonb_build_object('k', p.rn, 'text', p.left_text) order by p.rn) into v_left
      from (
        select mp.left_text, row_number() over (order by mp.position) as rn
        from public.matching_pairs mp where mp.question_id = rec.id
      ) p;

      select coalesce(
        (select jsonb_agg(jsonb_build_object('k', j.ord, 'text', mp.right_text) order by j.ord)
         from public.matching_pairs mp
         join lateral (
           select jj.value::uuid as pid, jj.ordinality as ord
           from jsonb_array_elements_text(v_attempt.match_orders -> rec.id::text)
                with ordinality as jj(value, ordinality)
         ) j on j.pid = mp.id
         where mp.question_id = rec.id),
        (select jsonb_agg(jsonb_build_object('k', p.rn, 'text', p.right_text) order by p.rn)
         from (
           select mp.right_text, row_number() over (order by mp.position) as rn
           from public.matching_pairs mp where mp.question_id = rec.id
         ) p)
      ) into v_right;

      v_item := v_item || jsonb_build_object('left_items', v_left, 'right_items', v_right);
      if v_reveal then
        v_item := v_item || jsonb_build_object(
          'correct_pairs',
          (select jsonb_agg(jsonb_build_object('left', l.left_text, 'right', l.right_text) order by l.pos)
           from (select left_text, right_text, position pos
                 from public.matching_pairs where question_id = rec.id) l)
        );
      end if;

    elsif rec.type = 'short_answer' then
      v_item := v_item || jsonb_build_object('match_mode', coalesce(rec.scoring_rule ->> 'match_mode', 'exact'));

    elsif rec.type = 'essay' then
      v_item := v_item || jsonb_build_object(
        'min_words', coalesce((rec.scoring_rule ->> 'min_words')::int, 0),
        'max_words', coalesce((rec.scoring_rule ->> 'max_words')::int, 0)
      );
    end if;

    if rec.type = 'true_false' and v_reveal then
      v_item := v_item || jsonb_build_object('correct_answer', coalesce(rec.scoring_rule ->> 'tf_answer', rec.default_answer ->> 'answer'));
    end if;
    if v_reveal and rec.type in ('short_answer') then
      v_item := v_item || jsonb_build_object('accepted_answers', coalesce(rec.default_answer -> 'accepted', '[]'::jsonb));
    end if;
    if v_reveal then
      v_item := v_item || jsonb_build_object('explanation', rec.explanation);
    end if;

    v_items := jsonb_set(v_items, ARRAY[rec.id::text], v_item);
  end loop;

  select st.nis, p.full_name, c.name as class_name, d.name as dept_name
    into v_stu
  from public.students st
  join public.profiles p on p.id = st.profile_id
  left join public.classes c on c.id = st.class_id
  left join public.departments d on d.id = c.department_id
  where st.id = (select student_id from public.exam_attempts where id = p_attempt_id);

  return jsonb_build_object(
    'attempt', jsonb_build_object(
      'id', v_attempt.id,
      'status', v_attempt.status,
      'started_at', v_attempt.started_at,
      'deadline', v_attempt.deadline,
      'duration_minutes', v_attempt.duration_minutes,
      'attempt_number', v_attempt.attempt_number,
      'violation_count', v_attempt.violation_count
    ),
    'exam', jsonb_build_object(
      'id', v_exam.id,
      'title', v_exam.title,
      'instructions', v_exam.instructions,
      'duration_minutes', v_exam.duration_minutes,
      'total_points', v_exam.total_points,
      'passing_grade', v_exam.passing_grade,
      'shuffle_questions', v_exam.shuffle_questions,
      'shuffle_options', v_exam.shuffle_options,
      'camera_monitoring', v_exam.camera_monitoring,
      'fullscreen_required', v_exam.fullscreen_required,
      'show_result_to_student', v_exam.show_result_to_student,
      'show_answers_after', v_exam.show_answers_after,
      'violation_limit', v_exam.violation_limit,
      'max_attempts', v_exam.max_attempts,
      'starts_at', v_exam.starts_at,
      'ends_at', v_exam.ends_at
    ),
    'student', jsonb_build_object(
      'name', v_stu.full_name, 'nis', v_stu.nis,
      'class', v_stu.class_name, 'department', v_stu.dept_name
    ),
    'questions', v_items,
    'order', v_attempt.question_order,
    'answers', coalesce((
      select jsonb_object_agg(a.question_id, a.value)
      from public.answers a where a.attempt_id = p_attempt_id
    ), '{}'::jsonb),
    'remaining_seconds', greatest(0, floor(extract(epoch from (v_attempt.deadline - now()))))::int,
    'server_time', now()
  );
end $$;

grant execute on function public.get_attempt_payload(uuid) to authenticated;

-- ---------- 2) record_security_event (private.* + user_id benar) ----------
create or replace function public.record_security_event(
  p_attempt_id uuid,
  p_event_type text,
  p_severity text default 'LOW',
  p_metadata jsonb default '{}'::jsonb,
  p_device_id text default null
) returns uuid
language plpgsql security definer set search_path = public, private
as $$
declare
  v_student_id uuid;
  v_profile_id uuid;
  v_exam_id uuid;
  v_ip text;
  v_ua text;
  v_id uuid;
begin
  select student_id, exam_id into v_student_id, v_exam_id
  from public.exam_attempts
  where id = p_attempt_id;

  if v_student_id is null then
    raise exception 'Attempt tidak ditemukan.';
  end if;

  select profile_id into v_profile_id
  from public.students
  where id = v_student_id;

  -- allow only own or admin/teacher pemilik ujian
  if v_profile_id is distinct from auth.uid() and not private.is_admin() then
    perform private.load_attempt_checked(p_attempt_id);
  end if;

  -- try to get IP from request headers
  begin
    v_ip := current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for';
    if v_ip is null then v_ip := current_setting('request.headers', true)::jsonb ->> 'x-real-ip'; end if;
  exception when others then v_ip := null;
  end;
  begin
    v_ua := current_setting('request.headers', true)::jsonb ->> 'user-agent';
  exception when others then v_ua := null;
  end;

  insert into public.security_events (user_id, exam_id, attempt_id, event_type, severity, ip_address, user_agent, device_id, metadata)
  values (coalesce(v_profile_id, auth.uid()), v_exam_id, p_attempt_id, p_event_type, coalesce(p_severity,'LOW'), v_ip, v_ua, p_device_id, coalesce(p_metadata,'{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.record_security_event(uuid,text,text,jsonb,text) to authenticated;

-- ---------- 3) start_attempt jsonb + deteksi device ----------
create or replace function public.start_attempt(
  p_exam_id uuid,
  p_pin text default null,
  p_user_agent text default null,
  p_ip text default null,
  p_device_info jsonb default null
)
returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  v_uid      uuid := auth.uid();
  v_role     public.user_role;
  v_student  public.students%rowtype;
  v_exam     public.exams%rowtype;
  v_existing public.exam_attempts%rowtype;
  v_attempt  public.exam_attempts%rowtype;
  v_used     int;
  v_qids     uuid[];
  v_opts     uuid[];
  v_pairs    uuid[];
  v_opt_ord  jsonb := '{}'::jsonb;
  v_match_ord jsonb := '{}'::jsonb;
  rec        record;
  v_new_device_id text;
  v_old_device_id text;
  v_old_ip text;
begin
  select role into v_role from public.profiles where id = v_uid;
  if v_role is distinct from 'student' then
    raise exception 'Hanya siswa yang dapat mengerjakan ujian.';
  end if;

  select * into v_student from public.students where profile_id = v_uid and is_active;
  if not found then
    raise exception 'Profil siswa tidak ditemukan atau tidak aktif.';
  end if;

  select * into v_exam from public.exams where id = p_exam_id;
  if not found then raise exception 'Ujian tidak ditemukan.'; end if;
  if coalesce(v_exam.allow_outside_schedule, false) = false then
    if v_exam.status <> 'published' then raise exception 'Ujian belum diaktifkan.'; end if;
    if now() < v_exam.starts_at then raise exception 'Ujian belum dimulai.'; end if;
    if now() > v_exam.ends_at then raise exception 'Periode ujian telah berakhir.'; end if;
  end if;
  if v_exam.pin_code is not null and v_exam.pin_code <> '' then
    if p_pin is distinct from v_exam.pin_code then
      raise exception 'PIN ujian salah.';
    end if;
  end if;
  if not private.exam_allows_student(v_exam.id, v_student.id) then
    raise exception 'Anda tidak terdaftar pada ujian ini.';
  end if;

  select * into v_existing
  from public.exam_attempts
  where exam_id = p_exam_id and student_id = v_student.id and status = 'in_progress'
  order by started_at desc limit 1;
  if found then
    begin
      v_new_device_id := coalesce(p_device_info->>'device_id', p_device_info->>'deviceId', '');
      v_old_device_id := coalesce(v_existing.device_info->>'device_id', v_existing.device_info->>'deviceId', '');
      if v_new_device_id <> '' and v_old_device_id <> '' and v_new_device_id <> v_old_device_id then
        perform public.record_security_event(v_existing.id, 'DEVICE_CHANGE', 'HIGH', jsonb_build_object('previous_device', v_existing.device_info, 'new_device', p_device_info));
        perform public.record_security_event(v_existing.id, 'MULTIPLE_DEVICE', 'HIGH', jsonb_build_object('existing_attempt', v_existing.id, 'new_device', p_device_info));
      end if;
      if p_ip is not null and p_ip <> '' then
        select ip_address into v_old_ip from public.exam_attempts where id = v_existing.id;
        if v_old_ip is not null and v_old_ip <> '' and v_old_ip <> p_ip then
          perform public.record_security_event(v_existing.id, 'IP_CHANGE', 'MEDIUM', jsonb_build_object('previous_ip', v_old_ip, 'new_ip', p_ip));
        end if;
      end if;
    exception when others then null;
    end;
    return jsonb_build_object('attempt_id', v_existing.id, 'resumed', true);
  end if;

  select count(*) into v_used
  from public.exam_attempts
  where exam_id = p_exam_id and student_id = v_student.id and status <> 'cancelled';
  if v_used >= v_exam.max_attempts then
    raise exception 'Kesempatan mengerjakan sudah habis.';
  end if;

  select coalesce(array_agg(question_id order by position), '{}'::uuid[]) into v_qids
  from public.exam_questions where exam_id = p_exam_id;
  if coalesce(array_length(v_qids, 1), 0) = 0 then
    raise exception 'Ujian belum memiliki soal.';
  end if;
  if v_exam.shuffle_questions then
    v_qids := private.shuffle(v_qids);
  end if;

  for rec in
    select q.id, q.type
    from public.questions q
    join public.exam_questions eq on eq.question_id = q.id
    where eq.exam_id = p_exam_id
  loop
    if v_exam.shuffle_options and rec.type in ('multiple_choice', 'multiple_response') then
      select coalesce(array_agg(id), '{}'::uuid[]) into v_opts
      from public.question_options where question_id = rec.id;
      v_opt_ord := jsonb_set(v_opt_ord, ARRAY[rec.id::text], to_jsonb(private.shuffle(v_opts)));
    elsif rec.type = 'matching' then
      select coalesce(array_agg(id), '{}'::uuid[]) into v_pairs
      from public.matching_pairs where question_id = rec.id;
      v_match_ord := jsonb_set(v_match_ord, ARRAY[rec.id::text], to_jsonb(private.shuffle(v_pairs)));
    end if;
  end loop;

  insert into public.exam_attempts (
    exam_id, student_id, attempt_number, deadline, duration_minutes,
    question_order, option_orders, match_orders,
    user_agent, ip_address, device_info, last_activity_at
  ) values (
    p_exam_id, v_student.id, v_used + 1,
    least(now() + make_interval(mins => v_exam.duration_minutes), v_exam.ends_at),
    v_exam.duration_minutes,
    to_jsonb(v_qids), v_opt_ord, v_match_ord,
    coalesce(
      nullif(left(coalesce(p_user_agent, ''), 500), ''),
      nullif(left(current_setting('request.headers', true)::json->>'user-agent', 500), '')
    ),
    nullif(left(coalesce(p_ip, ''), 64), ''),
    p_device_info,
    now()
  ) returning * into v_attempt;

  begin
    perform public.record_security_event(v_attempt.id, 'EXAM_START', 'INFO', jsonb_build_object('exam_id', p_exam_id));
  exception when others then null;
  end;

  perform public.log_audit('START_EXAM', 'exam_attempt', v_attempt.id::text,
                           jsonb_build_object('exam_id', p_exam_id));

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'resumed', false,
    'deadline', v_attempt.deadline
  );
end $$;

revoke all on function public.start_attempt(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.start_attempt(uuid, text, text, text, jsonb) to authenticated;

-- ---------- 4) submit_attempt + recalc bobot 100 + cast enum ----------
create or replace function public.submit_attempt(p_attempt_id uuid, p_auto boolean default false)
returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  v_attempt public.exam_attempts%rowtype;
  v_exam    public.exams%rowtype;
  v_ans     jsonb;
  v_ratio   numeric;
  v_ok      int := 0;
  v_bad     int := 0;
  v_none    int := 0;
  v_obj     numeric := 0;
  v_total_q int := 0;
  v_weight  numeric := 0;
  v_essay_total   int := 0;
  v_essay_graded  int := 0;
  v_essay_score   numeric := 0;
  v_pending       boolean;
  v_final         numeric;
  v_passed        boolean;
  rec       record;
  pr        record;
  v_order   uuid[];
  v_rk      int;
  v_tot     int;
  v_matches int;
begin
  select * into v_attempt from public.exam_attempts where id = p_attempt_id for update;
  if not found then raise exception 'Attempt tidak ditemukan.'; end if;

  if not exists (
    select 1 from public.students s
    where s.id = v_attempt.student_id and s.profile_id = auth.uid()
  ) and not private.is_admin() then
    raise exception 'Akses ditolak.';
  end if;

  if v_attempt.status <> 'in_progress' then
    return jsonb_build_object('already_submitted', true);
  end if;

  select * into v_exam from public.exams where id = v_attempt.exam_id;
  if p_auto is not true and now() > v_attempt.deadline + interval '60 seconds' then
    p_auto := true;
  end if;

  select count(*) into v_total_q
  from public.exam_questions eq where eq.exam_id = v_attempt.exam_id;
  if coalesce(v_total_q, 0) = 0 then
    raise exception 'Ujian belum memiliki soal.';
  end if;
  v_weight := 100.0 / v_total_q;

  for rec in
    select eq.question_id as qid,
           q.type as qtype, q.default_answer, q.scoring_rule
    from public.exam_questions eq
    join public.questions q on q.id = eq.question_id
    where eq.exam_id = v_attempt.exam_id
  loop
    continue when rec.qtype = 'essay';

    select value into v_ans from public.answers
    where attempt_id = p_attempt_id and question_id = rec.qid;

    if v_ans is null or jsonb_typeof(v_ans) = 'null'
       or (rec.qtype in ('short_answer') and coalesce(v_ans #>> '{}', '') = '')
       or (rec.qtype = 'multiple_response' and jsonb_typeof(v_ans) = 'array' and jsonb_array_length(v_ans) = 0) then
      v_none := v_none + 1;
      continue;
    end if;

    begin
      v_ratio := 0;
      if rec.qtype = 'multiple_choice' then
        select case when o.is_correct then 1 else 0 end into v_ratio
        from public.question_options o
        where o.question_id = rec.qid and o.id = (v_ans #>> '{}')::uuid;
        v_ratio := coalesce(v_ratio, 0);

      elsif rec.qtype = 'multiple_response' then
        with sel as (
          select s.value::uuid as oid from jsonb_array_elements_text(v_ans) s(value)
        ),
        tot as (
          select count(*)::int as n from public.question_options
          where question_id = rec.qid and is_correct
        ),
        okc as (
          select count(*)::int as n
          from sel join public.question_options o on o.id = sel.oid and o.is_correct
        ),
        badc as (
          select count(*)::int as n
          from sel join public.question_options o on o.id = sel.oid and not o.is_correct
        )
        select case
                 when tot.n = 0 then 0
                 when coalesce(rec.scoring_rule ->> 'partial', 'false') = 'true'
                   then greatest(0, okc.n - badc.n)::numeric / tot.n
                 else (okc.n = tot.n and badc.n = 0)::int
               end
        into v_ratio from tot, okc, badc;

      elsif rec.qtype = 'true_false' then
        v_ratio := (lower(coalesce(v_ans::text, '')) = lower(coalesce(rec.default_answer ->> 'answer', 'false')))::int;

      elsif rec.qtype = 'short_answer' then
        if coalesce(rec.scoring_rule ->> 'match_mode', 'exact') = 'contains' then
          select exists (
            select 1 from jsonb_array_elements_text(coalesce(rec.default_answer -> 'accepted', '[]'::jsonb)) a(v)
            where position(private.norm_text(a.v) in private.norm_text(v_ans #>> '{}')) > 0
          )::int into v_ratio;
        elsif coalesce(rec.scoring_rule ->> 'match_mode', 'exact') = 'numeric' then
          begin
            v_ratio := (abs((v_ans #>> '{}')::numeric - (coalesce(rec.default_answer -> 'accepted', '[]'::jsonb ->> 0))::numeric)
                        <= coalesce((rec.scoring_rule ->> 'tolerance')::numeric, 0))::int;
          exception when others then v_ratio := 0;
          end;
        else
          select exists (
            select 1
            from jsonb_array_elements_text(coalesce(rec.default_answer -> 'accepted', '[]'::jsonb)) a(v)
            where private.norm_text(a.v) = private.norm_text(v_ans #>> '{}')
          )::int into v_ratio;
        end if;

      elsif rec.qtype = 'matching' then
        select array(select value::uuid
                     from jsonb_array_elements_text(v_attempt.match_orders -> rec.qid::text)) into v_order;
        v_tot := 0; v_matches := 0;
        for pr in
          select mp.id,
                 (row_number() over (order by mp.position)) as rn
          from public.matching_pairs mp where mp.question_id = rec.qid
        loop
          v_tot := v_tot + 1;
          v_rk := coalesce((v_ans ->> pr.rn::text)::int, 0);
          if v_rk between 1 and coalesce(array_length(v_order, 1), 0)
             and v_order[v_rk] = pr.id then
            v_matches := v_matches + 1;
          end if;
        end loop;
        v_ratio := case
                     when v_tot = 0 then 0
                     when coalesce(rec.scoring_rule ->> 'partial', 'false') = 'true'
                       then v_matches::numeric / v_tot
                     else (v_matches = v_tot)::int
                   end;
      end if;
    exception when others then
      v_ratio := 0;
    end;

    v_obj := v_obj + (coalesce(v_ratio, 0) * v_weight);
    if coalesce(v_ratio, 0) >= 1 then v_ok := v_ok + 1; else v_bad := v_bad + 1; end if;
  end loop;

  select count(*) into v_essay_total
  from public.exam_questions eq join public.questions q on q.id = eq.question_id
  where eq.exam_id = v_attempt.exam_id and q.type = 'essay';

  select count(*) into v_essay_graded
  from public.essay_grades g
  where g.attempt_id = p_attempt_id and g.status = 'graded';

  select coalesce(sum(
    (least(100, greatest(0, g.final_score)) / 100.0) * v_weight
  ), 0) into v_essay_score
  from public.essay_grades g
  where g.attempt_id = p_attempt_id and g.status = 'graded';

  v_obj := round(least(100, greatest(0, v_obj)), 2);
  v_essay_score := round(least(100, greatest(0, v_essay_score)), 2);
  v_pending := v_essay_graded < v_essay_total;
  v_final   := round(least(100, v_obj + v_essay_score), 2);
  v_passed  := case when v_pending or v_exam.passing_grade <= 0 then null
                    else v_final >= v_exam.passing_grade end;

  update public.exam_attempts
  set status = (case when p_auto then 'auto_submitted' else 'submitted' end)::public.attempt_status,
      submitted_at = now(),
      last_activity_at = now()
  where id = p_attempt_id;

  insert into public.exam_results (
    attempt_id, exam_id, student_id, total_questions,
    correct_count, wrong_count, unanswered_count,
    objective_score, essay_score, final_score, passed,
    submitted_at, duration_seconds, violation_count
  ) values (
    p_attempt_id, v_attempt.exam_id, v_attempt.student_id,
    v_total_q, v_ok, v_bad, v_none,
    v_obj, case when v_essay_total = 0 then null else v_essay_score end,
    v_final, v_passed,
    now(), extract(epoch from (now() - v_attempt.started_at))::int,
    v_attempt.violation_count
  )
  on conflict (attempt_id) do update set
    total_questions = excluded.total_questions,
    correct_count = excluded.correct_count,
    wrong_count = excluded.wrong_count,
    unanswered_count = excluded.unanswered_count,
    objective_score = excluded.objective_score,
    essay_score = excluded.essay_score,
    final_score = excluded.final_score,
    passed = excluded.passed,
    submitted_at = excluded.submitted_at,
    duration_seconds = excluded.duration_seconds,
    violation_count = excluded.violation_count,
    updated_at = now();

  perform public.log_audit(
    case when p_auto then 'AUTO_SUBMIT' else 'SUBMIT_EXAM' end,
    'exam_attempt', p_attempt_id::text,
    jsonb_build_object('exam_id', v_attempt.exam_id, 'objective_score', v_obj)
  );

  return jsonb_build_object(
    'objective_score', v_obj,
    'correct', v_ok, 'wrong', v_bad, 'unanswered', v_none,
    'essay_total', v_essay_total,
    'essay_graded', v_essay_graded,
    'essay_pending', v_pending,
    'final_score', v_final,
    'passed', v_passed
  );
end $$;

create or replace function public.recalc_result(p_attempt_id uuid)
returns void
language plpgsql volatile security definer set search_path = public, private as $$
declare
  r public.exam_results%rowtype;
  v_exam public.exams%rowtype;
  v_total_q int;
  v_weight numeric;
  v_essay_total int;
  v_essay_graded int;
  v_essay_score numeric;
  v_final numeric;
begin
  select * into r from public.exam_results where attempt_id = p_attempt_id;
  if not found then return; end if;

  select * into v_exam from public.exams where id = r.exam_id;

  select count(*) into v_total_q
  from public.exam_questions where exam_id = r.exam_id;
  v_total_q := greatest(coalesce(v_total_q, 0), 1);
  v_weight := 100.0 / v_total_q;

  select count(*) into v_essay_total
  from public.exam_questions eq join public.questions q on q.id = eq.question_id
  where eq.exam_id = r.exam_id and q.type = 'essay';

  select count(*) into v_essay_graded
  from public.essay_grades g where g.attempt_id = p_attempt_id and g.status = 'graded';

  select coalesce(sum(
    (least(100, greatest(0, g.final_score)) / 100.0) * v_weight
  ), 0) into v_essay_score
  from public.essay_grades where attempt_id = p_attempt_id and status = 'graded';

  v_essay_score := round(least(100, greatest(0, v_essay_score)), 2);
  v_final := round(least(100, coalesce(r.objective_score, 0) + v_essay_score), 2);

  if coalesce(r.objective_score, 0) > 100 then
    update public.exam_results
    set objective_score = round(least(100, greatest(0,
      case when nullif(r.total_questions, 0) is not null and r.total_questions > 0
        then (r.correct_count::numeric / r.total_questions::numeric) * 100
        else 0 end
    )), 2)
    where attempt_id = p_attempt_id
    returning objective_score into r.objective_score;
    v_final := round(least(100, coalesce(r.objective_score, 0) + v_essay_score), 2);
  end if;

  update public.exam_results
  set essay_score = case when v_essay_total = 0 then null else v_essay_score end,
      final_score = v_final,
      total_questions = v_total_q,
      passed = case when v_essay_graded < v_essay_total or v_exam.passing_grade <= 0 then null
                    else v_final >= v_exam.passing_grade end,
      updated_at = now()
  where attempt_id = p_attempt_id;

  if v_essay_graded >= v_essay_total then
    update public.exam_attempts
    set status = 'graded'::public.attempt_status
    where id = p_attempt_id and status in ('submitted'::public.attempt_status, 'auto_submitted'::public.attempt_status);
  end if;
end $$;

-- Normalisasi data lama tanpa essay: nilai = 100 * benar / total
update public.exam_results r
set objective_score = round(
    case when nullif(r.total_questions, 0) is not null
      then (r.correct_count::numeric / r.total_questions::numeric) * 100
      else 0 end, 2),
  final_score = round(
    case when nullif(r.total_questions, 0) is not null
      then (r.correct_count::numeric / r.total_questions::numeric) * 100
      else 0 end, 2),
  updated_at = now()
where r.objective_score > 100
  and not exists (
    select 1 from public.exam_questions eq
    join public.questions q on q.id = eq.question_id
    where eq.exam_id = r.exam_id and q.type = 'essay'
  );

-- ---------- 5) Constraint essay_grades idempotent ----------
update public.essay_grades set status = 'pending' where status = 'ai_graded';
alter table public.essay_grades drop constraint if exists essay_grades_status_check;
do $$ begin
  alter table public.essay_grades add constraint essay_grades_status_check check (status in ('pending', 'graded'));
exception when duplicate_object then null;
end $$;

-- ---------- 6) Grants lengkap ----------
grant execute on function public.get_attempt_payload(uuid) to authenticated;
grant execute on function public.student_available_exams() to authenticated;
grant execute on function public.save_answer(uuid, uuid, jsonb) to authenticated;
grant execute on function public.submit_attempt(uuid, boolean) to authenticated;
grant execute on function public.record_violation(uuid, text, text, jsonb) to authenticated;
grant execute on function public.recalc_result(uuid) to authenticated;
grant execute on function public.ensure_result_recalc(uuid) to authenticated;
grant execute on function public.get_exam_class_ranking(uuid) to authenticated;
grant execute on function public.admin_wipe_schedules() to authenticated;
grant execute on function public.admin_wipe_all_keep_me() to authenticated;
grant execute on function public.admin_wipe_group(text) to authenticated;

-- ------------------------------------------------------------
-- SUMBER: 00040_default_hijau.sql
-- ------------------------------------------------------------
-- ============================================================
-- SMK AL-FATA CBT — Migration 00040: Default hijau
-- Warna bawaan aplikasi menjadi hijau (primary #15803D,
-- secondary #22C55E) menggantikan teal/cyan/copper.
-- AMAN: baris school_settings hanya diubah bila masih persis
-- nilai default lama (belum dikustom admin).
-- Idempotent, aman dijalankan ulang di SQL Editor Supabase.
-- ============================================================

alter table public.school_settings
  alter column primary_color set default '#15803D';

alter table public.school_settings
  alter column secondary_color set default '#22C55E';

update public.school_settings
set
  primary_color = '#15803D',
  secondary_color = '#22C55E',
  updated_at = now()
where id = true
  and primary_color = '#0D868F'
  and secondary_color = '#0CBCC9';

insert into public.school_settings (id, app_name, school_name, logo_url, favicon_url, primary_color, secondary_color)
values (true, 'SMK AL-FATA CBT', 'SMK AL-FATA', '/logo.webp', '/logo.webp', '#15803D', '#22C55E')
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- SUMBER: 00041_default_teal.sql
-- ------------------------------------------------------------
-- ============================================================
-- SMK AL-FATA CBT — Migration 00041: Default teal + copper
-- Warna bawaan aplikasi menjadi teal #0D868F + copper #C67C3B
-- (preset "Bengkel Presisi").
-- AMAN: baris school_settings hanya diubah bila masih berisi
-- nilai default lama (teal/cyan/hijau) dengan preset bawaan —
-- kustom admin (preset kustom / warna lain) tidak disentuh.
-- Idempotent, aman dijalankan ulang di SQL Editor Supabase.
-- ============================================================

alter table public.school_settings
  alter column primary_color set default '#0D868F';

alter table public.school_settings
  alter column secondary_color set default '#C67C3B';

update public.school_settings
set
  primary_color = '#0D868F',
  secondary_color = '#C67C3B',
  updated_at = now()
where id = true
  and primary_color in ('#0D868F', '#15803D')
  and secondary_color in ('#0CBCC9', '#22C55E', '#C67C3B')
  and (theme_preset is null or theme_preset = 'bengkel-presisi');

insert into public.school_settings (id, app_name, school_name, logo_url, favicon_url, primary_color, secondary_color)
values (true, 'SMK AL-FATA CBT', 'SMK AL-FATA', '/logo.webp', '/logo.webp', '#0D868F', '#C67C3B')
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- SUMBER: 00042_default_teal_lembut.sql
-- ------------------------------------------------------------
-- ============================================================
-- SMK AL-FATA CBT — Migration 00042: Default teal bergradasi lembut
-- Warna bawaan aplikasi hanya teal: primary #0D868F dengan
-- secondary #2DD4BF (tanpa kuning/oranye).
-- AMAN: baris school_settings hanya diubah bila masih berisi
-- nilai default lama dengan preset bawaan — kustom admin
-- (preset kustom / warna lain) tidak disentuh.
-- Idempotent, aman dijalankan ulang di SQL Editor Supabase.
-- ============================================================

alter table public.school_settings
  alter column primary_color set default '#0D868F';

alter table public.school_settings
  alter column secondary_color set default '#2DD4BF';

update public.school_settings
set
  primary_color = '#0D868F',
  secondary_color = '#2DD4BF',
  updated_at = now()
where id = true
  and primary_color in ('#0D868F', '#15803D')
  and secondary_color in ('#0CBCC9', '#22C55E', '#C67C3B', '#2DD4BF')
  and secondary_color <> '#2DD4BF'
  and (theme_preset is null or theme_preset = 'bengkel-presisi');

insert into public.school_settings (id, app_name, school_name, logo_url, favicon_url, primary_color, secondary_color)
values (true, 'SMK AL-FATA CBT', 'SMK AL-FATA', '/logo.webp', '/logo.webp', '#0D868F', '#2DD4BF')
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- SUMBER: 00043_default_warna_baru.sql
-- ------------------------------------------------------------
-- ============================================================
-- SMK AL-FATA CBT — Migration 00043: Default warna baru
-- Sidebar #0D868F, splash screen #064247, background #EDEDED.
-- Warna login tidak diubah.
-- AMAN: tiap kolom hanya diubah bila masih bernilai default lama
-- — kustom admin tidak disentuh.
-- Idempotent, aman dijalankan ulang di SQL Editor Supabase.
-- ============================================================

alter table public.school_settings
  alter column sidebar_color set default '#0D868F';

alter table public.school_settings
  alter column splash_bg_color set default '#064247';

alter table public.school_settings
  alter column app_bg_color set default '#EDEDED';

update public.school_settings
set sidebar_color = '#0D868F', updated_at = now()
where id = true and sidebar_color = '#0B1E24';

update public.school_settings
set splash_bg_color = '#064247', updated_at = now()
where id = true and splash_bg_color = '#0B1E24';

update public.school_settings
set app_bg_color = '#EDEDED', updated_at = now()
where id = true and app_bg_color = '#FDF9F3';

insert into public.school_settings (id, app_name, school_name, logo_url, favicon_url, primary_color, secondary_color, sidebar_color, splash_bg_color, app_bg_color)
values (true, 'SMK AL-FATA CBT', 'SMK AL-FATA', '/logo.webp', '/logo.webp', '#0D868F', '#2DD4BF', '#0D868F', '#064247', '#EDEDED')
on conflict (id) do nothing;

select 'BAGIAN_04_SELESAI' as status;