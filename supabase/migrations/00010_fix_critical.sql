-- ============================================================
-- SMK AL-FATA CBT — Migration 00010: Critical fixes
-- 1) Perbaiki signature start_attempt (p_user_agent, p_ip, p_device_info)
-- 2) Izinkan siswa upload snapshot kamera ke bucket media
-- 3) Aktifkan realtime untuk tabel laporan AI & notifikasi
-- 4) Tambah trigger sync is_active profiles <-> students/teachers
-- ============================================================

-- ---------- 1) Fix start_attempt signature ----------
drop function if exists public.start_attempt(uuid, text);

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
  if v_exam.status <> 'published' then raise exception 'Ujian belum diaktifkan.'; end if;
  if now() < v_exam.starts_at then raise exception 'Ujian belum dimulai.'; end if;
  if now() > v_exam.ends_at then raise exception 'Periode ujian telah berakhir.'; end if;
  if v_exam.pin_code is not null and coalesce(p_pin, '') <> v_exam.pin_code then
    raise exception 'PIN ujian salah.';
  end if;
  if not private.exam_allows_student(v_exam.id, v_student.id) then
    raise exception 'Anda tidak terdaftar pada ujian ini.';
  end if;

  select * into v_existing
  from public.exam_attempts
  where exam_id = p_exam_id and student_id = v_student.id and status = 'in_progress'
  order by started_at desc limit 1;
  if found then
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

  perform public.log_audit('START_EXAM', 'exam_attempt', v_attempt.id::text,
                           jsonb_build_object('exam_id', p_exam_id));

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'resumed', false,
    'deadline', v_attempt.deadline
  );
end $$;

comment on function public.start_attempt is 'Fixed in 00010: signature now includes p_user_agent, p_ip, p_device_info';


-- ---------- 2) Storage: izinkan siswa upload snapshot kamera ----------
-- Kebijakan lama hanya admin/teacher. Tambahkan kebijakan student untuk folder exam-snapshots

drop policy if exists "media_insert_student_snapshot" on storage.objects;
create policy "media_insert_student_snapshot" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and private.my_role() = 'student'
    and (storage.foldername(name))[1] in ('exam-snapshots', 'exam-snapshot', 'camera')
  );

-- Juga perlonggar media_insert_staff agar tetap idempotent
drop policy if exists "media_insert_staff" on storage.objects;
create policy "media_insert_staff" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and private.my_role() in ('admin', 'teacher'));

-- Pastikan bucket public tetap readable
drop policy if exists "media_public_read" on storage.objects;
create policy "media_public_read" on storage.objects for select
  using (bucket_id = 'media');


-- ---------- 3) Realtime publication untuk laporan AI & notifikasi ----------
-- Supabase realtime butuh tabel di publication supabase_realtime
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'essay_grades') then
    alter publication supabase_realtime add table public.essay_grades;
  end if;
exception when others then null; end $$;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'exam_results') then
    alter publication supabase_realtime add table public.exam_results;
  end if;
exception when others then null; end $$;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'exam_attempts') then
    alter publication supabase_realtime add table public.exam_attempts;
  end if;
exception when others then null; end $$;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception when others then null; end $$;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ai_provider_keys') then
    alter publication supabase_realtime add table public.ai_provider_keys;
  end if;
exception when others then null; end $$;


-- ---------- 4) Sync is_active antara profiles <-> students/teachers ----------
-- Saat profiles.is_active diubah via Edge Function, ikut sinkron ke students/teachers

create or replace function private.sync_profile_active()
returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  if new.is_active is distinct from old.is_active then
    update public.students set is_active = new.is_active where profile_id = new.id;
    update public.teachers set is_active = new.is_active where profile_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists trg_sync_profile_active on public.profiles;
create trigger trg_sync_profile_active
after update of is_active on public.profiles
for each row execute function private.sync_profile_active();

-- Kebalikan: jika students/teachers di-update manual, sinkron ke profiles (optional, tapi jaga konsistensi)
create or replace function private.sync_student_active()
returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  if new.is_active is distinct from old.is_active then
    update public.profiles set is_active = new.is_active where id = new.profile_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_sync_student_active on public.students;
create trigger trg_sync_student_active
after update of is_active on public.students
for each row execute function private.sync_student_active();

create or replace function private.sync_teacher_active()
returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  if new.is_active is distinct from old.is_active then
    update public.profiles set is_active = new.is_active where id = new.profile_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_sync_teacher_active on public.teachers;
create trigger trg_sync_teacher_active
after update of is_active on public.teachers
for each row execute function private.sync_teacher_active();
