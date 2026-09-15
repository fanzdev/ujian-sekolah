-- ============================================================
-- SMK AL-FATA CBT - SETUP BAGIAN 03 (00022 s.d. 00032)
-- Isi: Aturan ujian, jendela waktu, status attempt, anti-cheat device
-- Cara pakai: jalankan file 01, 02, 03, 04 BERURUTAN di SQL Editor.
-- Setiap bagian diakhiri pesan konfirmasi BAGIAN_XX_SELESAI.
-- Semua perintah idempotent, aman dijalankan ulang.
-- ============================================================

-- ------------------------------------------------------------
-- SUMBER: 00022_fix_student_available_exams_aturan.sql
-- ------------------------------------------------------------
-- ============================================================
-- Fix: student_available_exams harus mengembalikan semua flag Aturan
-- agar toggle di menu Aturan benar-benar berfungsi (aktif/nonaktif).
-- Sebelumnya auto_submit_on_limit & show_answers_after tidak dikirim,
-- sehingga frontend tidak bisa membedakan on/off.
-- ============================================================

create or replace function public.student_available_exams()
returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  v_uid   uuid := auth.uid();
  v_sid   uuid;
  v_res   jsonb := '[]'::jsonb;
  rec     record;
  v_used  int;
  v_best  numeric;
  v_active uuid;
  v_qtot  int;
  v_state text;
begin
  select id into v_sid from public.students where profile_id = v_uid;
  if v_sid is null then
    return v_res;
  end if;

  for rec in
    select e.*, sub.name as subject_name, tp.full_name as teacher_name
    from public.exams e
    left join public.subjects sub on sub.id = e.subject_id
    left join public.teachers te on te.id = e.teacher_id
    left join public.profiles tp on tp.id = te.profile_id
    where e.status = 'published'
      and e.ends_at > now() - interval '2 days'
      and e.starts_at < now() + interval '60 days'
  loop
    continue when not private.exam_allows_student(rec.id, v_sid);

    select count(*) into v_used
    from public.exam_attempts a
    where a.exam_id = rec.id and a.student_id = v_sid and a.status <> 'cancelled';

    select a.id into v_active
    from public.exam_attempts a
    where a.exam_id = rec.id and a.student_id = v_sid and a.status = 'in_progress'
    limit 1;

    select max(r.final_score) into v_best
    from public.exam_results r
    join public.exam_attempts a on a.id = r.attempt_id
    where a.exam_id = rec.id and a.student_id = v_sid;

    select count(*) into v_qtot from public.exam_questions eq where eq.exam_id = rec.id;

    if v_active is not null then
      v_state := 'resume';
    elsif now() < rec.starts_at then
      v_state := 'upcoming';
    elsif now() > rec.ends_at then
      v_state := 'closed';
    elsif v_used >= rec.max_attempts then
      v_state := 'no_attempts';
    else
      v_state := 'can_start';
    end if;

    v_res := v_res || jsonb_build_object(
      'id', rec.id,
      'title', rec.title,
      'description', rec.description,
      'subject_name', rec.subject_name,
      'teacher_name', rec.teacher_name,
      'starts_at', rec.starts_at,
      'ends_at', rec.ends_at,
      'duration_minutes', rec.duration_minutes,
      'total_questions', v_qtot,
      'total_points', rec.total_points,
      'passing_grade', rec.passing_grade,
      'max_attempts', rec.max_attempts,
      'attempts_used', v_used,
      'has_pin', rec.pin_code is not null,
      'camera_monitoring', rec.camera_monitoring,
      'fullscreen_required', rec.fullscreen_required,
      'violation_limit', rec.violation_limit,
      'auto_submit_on_limit', rec.auto_submit_on_limit,
      'show_result_to_student', rec.show_result_to_student,
      'show_answers_after', rec.show_answers_after,
      'status_for_me', v_state,
      'active_attempt_id', v_active,
      'best_score', v_best
    );
  end loop;

  return v_res;
end $$;

-- ------------------------------------------------------------
-- SUMBER: 00023_aturan_default_all_active.sql
-- ------------------------------------------------------------
-- Aturan ujian default semua aktif sesuai permintaan user
-- 1) Ubah default kolom exams agar ujian baru langsung aktif semua fitur
-- 2) Update system_settings exam_defaults agar panel Admin & ExamEditor menampilkan ON

alter table public.exams alter column fullscreen_required set default true;
alter table public.exams alter column camera_monitoring set default true;
alter table public.exams alter column show_answers_after set default true;

-- Update system_settings exam_defaults jika sudah ada (jangan overwrite custom admin jika sudah diubah, tapi pastikan semua true untuk instalasi baru)
-- Untuk instalasi existing, paksa update agar default baru aktif semua (admin masih bisa matikan manual per ujian)
update public.system_settings
set value = jsonb_set(
  jsonb_set(
    jsonb_set(
      coalesce(value, '{}'::jsonb),
      '{fullscreen_required}', 'true'::jsonb
    ),
    '{camera_monitoring}', 'true'::jsonb
  ),
  '{show_answers_after}', 'true'::jsonb
)
where key = 'exam_defaults';

-- Jika belum ada row exam_defaults (fresh install via 00005), insert dengan semua true
insert into public.system_settings (key, value)
values (
  'exam_defaults',
  '{
    "duration_minutes": 60,
    "max_attempts": 1,
    "violation_limit": 3,
    "auto_submit_on_limit": true,
    "shuffle_questions": true,
    "shuffle_options": true,
    "fullscreen_required": true,
    "camera_monitoring": true,
    "show_result_to_student": true,
    "show_answers_after": true,
    "passing_grade": 0
  }'
)
on conflict (key) do nothing;

-- ------------------------------------------------------------
-- SUMBER: 00024_allow_outside_schedule.sql
-- ------------------------------------------------------------
-- Allow admin to let students finish/submit even outside schedule
alter table public.exams add column if not exists allow_outside_schedule boolean not null default false;

-- Update system default to false (admin can enable per exam)
update public.system_settings
set value = jsonb_set(coalesce(value,'{}'::jsonb), '{allow_outside_schedule}', 'false'::jsonb)
where key = 'exam_defaults';

-- Patch student_available_exams to respect allow_outside_schedule and to allow resume for draft/completed with active attempt
create or replace function public.student_available_exams()
returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  v_uid   uuid := auth.uid();
  v_sid   uuid;
  v_res   jsonb := '[]'::jsonb;
  rec     record;
  v_used  int;
  v_best  numeric;
  v_active uuid;
  v_qtot  int;
  v_state text;
begin
  select id into v_sid from public.students where profile_id = v_uid;
  if v_sid is null then
    return v_res;
  end if;

  for rec in
    select e.*, sub.name as subject_name, tp.full_name as teacher_name
    from public.exams e
    left join public.subjects sub on sub.id = e.subject_id
    left join public.teachers te on te.id = e.teacher_id
    left join public.profiles tp on tp.id = te.profile_id
    where (
      -- normal window: only published within 2 days window
      (e.status = 'published' and e.ends_at > now() - interval '2 days' and e.starts_at < now() + interval '60 days')
      -- or allow_outside_schedule enabled and student is participant (so they can finish even if not time)
      or (e.allow_outside_schedule = true and private.exam_allows_student(e.id, v_sid))
      -- or student has active in_progress attempt for this exam (so they can resume to finish even if draft/completed)
      or exists (select 1 from public.exam_attempts a where a.exam_id = e.id and a.student_id = v_sid and a.status = 'in_progress')
    )
  loop
    continue when not private.exam_allows_student(rec.id, v_sid);

    select count(*) into v_used
    from public.exam_attempts a
    where a.exam_id = rec.id and a.student_id = v_sid and a.status <> 'cancelled';

    select a.id into v_active
    from public.exam_attempts a
    where a.exam_id = rec.id and a.student_id = v_sid and a.status = 'in_progress'
    limit 1;

    select max(r.final_score) into v_best
    from public.exam_results r
    join public.exam_attempts a on a.id = r.attempt_id
    where a.exam_id = rec.id and a.student_id = v_sid;

    select count(*) into v_qtot from public.exam_questions eq where eq.exam_id = rec.id;

    if v_active is not null then
      v_state := 'resume';
    elsif rec.allow_outside_schedule then
      -- when allow outside, ignore window, only check attempts
      if v_used >= rec.max_attempts then
        v_state := 'no_attempts';
      else
        v_state := 'can_start';
      end if;
    elsif now() < rec.starts_at then
      v_state := 'upcoming';
    elsif now() > rec.ends_at then
      v_state := 'closed';
    elsif v_used >= rec.max_attempts then
      v_state := 'no_attempts';
    else
      v_state := 'can_start';
    end if;

    v_res := v_res || jsonb_build_object(
      'id', rec.id,
      'title', rec.title,
      'description', rec.description,
      'subject_name', rec.subject_name,
      'teacher_name', rec.teacher_name,
      'starts_at', rec.starts_at,
      'ends_at', rec.ends_at,
      'duration_minutes', rec.duration_minutes,
      'total_questions', v_qtot,
      'total_points', rec.total_points,
      'passing_grade', rec.passing_grade,
      'max_attempts', rec.max_attempts,
      'attempts_used', v_used,
      'has_pin', rec.pin_code is not null,
      'camera_monitoring', rec.camera_monitoring,
      'fullscreen_required', rec.fullscreen_required,
      'violation_limit', rec.violation_limit,
      'auto_submit_on_limit', rec.auto_submit_on_limit,
      'allow_outside_schedule', rec.allow_outside_schedule,
      'show_result_to_student', rec.show_result_to_student,
      'show_answers_after', rec.show_answers_after,
      'status_for_me', v_state,
      'active_attempt_id', v_active,
      'best_score', v_best
    );
  end loop;

  return v_res;
end $$;

-- Patch start_attempt to allow outside schedule when flag is true
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
  -- allow outside schedule to bypass status/window checks
  if coalesce(v_exam.allow_outside_schedule, false) = false then
    if v_exam.status <> 'published' then raise exception 'Ujian belum diaktifkan.'; end if;
    if now() < v_exam.starts_at then raise exception 'Ujian belum dimulai.'; end if;
    if now() > v_exam.ends_at then raise exception 'Periode ujian telah berakhir.'; end if;
  end if;
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

-- Ensure get_attempt_payload also allows outside schedule (no window check needed, just load)
-- No change needed for submit_attempt (already allows submit even after window via p_auto)

-- ------------------------------------------------------------
-- SUMBER: 00025_fix_student_available_strict_window.sql
-- ------------------------------------------------------------
-- Perketat student_available_exams: ujian hanya muncul jika benar-benar boleh dikerjakan (can_start/resume)
-- Sebelumnya upcoming (starts_at di masa depan) tetap dikembalikan dan tampil di "Akan Datang", membuat admin bingung
-- "saya mengaktifkan satu ujian saja tapi kenapa di role siswa kok muncul ujiannya?" padahal belum waktunya.
-- Fix: hanya kembalikan ujian yang published DAN sudah masuk window (starts_at <= now() <= ends_at) atau allow_outside_schedule=true atau punya in_progress.
-- Upcoming tidak dikembalikan (frontend akan kosong untuk upcoming, hanya tampil di Jadwal).

create or replace function public.student_available_exams()
returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  v_uid   uuid := auth.uid();
  v_sid   uuid;
  v_res   jsonb := '[]'::jsonb;
  rec     record;
  v_used  int;
  v_best  numeric;
  v_active uuid;
  v_qtot  int;
  v_state text;
begin
  select id into v_sid from public.students where profile_id = v_uid;
  if v_sid is null then
    return v_res;
  end if;

  for rec in
    select e.*, sub.name as subject_name, tp.full_name as teacher_name
    from public.exams e
    left join public.subjects sub on sub.id = e.subject_id
    left join public.teachers te on te.id = e.teacher_id
    left join public.profiles tp on tp.id = te.profile_id
    where (
      -- hanya yang published DAN sudah masuk window (tidak upcoming) ATAU allow_outside
      (e.status = 'published' and e.starts_at <= now() and e.ends_at > now() - interval '2 days')
      or (e.allow_outside_schedule = true and private.exam_allows_student(e.id, v_sid))
      or exists (select 1 from public.exam_attempts a where a.exam_id = e.id and a.student_id = v_sid and a.status = 'in_progress')
    )
  loop
    continue when not private.exam_allows_student(rec.id, v_sid);

    select count(*) into v_used
    from public.exam_attempts a
    where a.exam_id = rec.id and a.student_id = v_sid and a.status <> 'cancelled';

    select a.id into v_active
    from public.exam_attempts a
    where a.exam_id = rec.id and a.student_id = v_sid and a.status = 'in_progress'
    limit 1;

    select max(r.final_score) into v_best
    from public.exam_results r
    join public.exam_attempts a on a.id = r.attempt_id
    where a.exam_id = rec.id and a.student_id = v_sid;

    select count(*) into v_qtot from public.exam_questions eq where eq.exam_id = rec.id;

    if v_active is not null then
      v_state := 'resume';
    elsif rec.allow_outside_schedule then
      if v_used >= rec.max_attempts then
        v_state := 'no_attempts';
      else
        v_state := 'can_start';
      end if;
    elsif now() < rec.starts_at then
      -- seharusnya tidak terjadi karena where sudah filter starts_at <= now(), tapi jaga-jaga
      v_state := 'upcoming';
    elsif now() > rec.ends_at then
      v_state := 'closed';
    elsif v_used >= rec.max_attempts then
      v_state := 'no_attempts';
    else
      v_state := 'can_start';
    end if;

    -- jangan kembalikan upcoming ke student (hanya can_start/resume/no_attempts/closed yang relevan)
    -- upcoming sudah difilter di where, tapi jika ada yang lolos karena allow_outside, tetap can_start
    v_res := v_res || jsonb_build_object(
      'id', rec.id,
      'title', rec.title,
      'description', rec.description,
      'subject_name', rec.subject_name,
      'teacher_name', rec.teacher_name,
      'starts_at', rec.starts_at,
      'ends_at', rec.ends_at,
      'duration_minutes', rec.duration_minutes,
      'total_questions', v_qtot,
      'total_points', rec.total_points,
      'passing_grade', rec.passing_grade,
      'max_attempts', rec.max_attempts,
      'attempts_used', v_used,
      'has_pin', rec.pin_code is not null,
      'camera_monitoring', rec.camera_monitoring,
      'fullscreen_required', rec.fullscreen_required,
      'violation_limit', rec.violation_limit,
      'auto_submit_on_limit', rec.auto_submit_on_limit,
      'allow_outside_schedule', rec.allow_outside_schedule,
      'show_result_to_student', rec.show_result_to_student,
      'show_answers_after', rec.show_answers_after,
      'status_for_me', v_state,
      'active_attempt_id', v_active,
      'best_score', v_best
    );
  end loop;

  return v_res;
end $$;

-- ------------------------------------------------------------
-- SUMBER: 00026_fix_attempt_status_cast.sql
-- ------------------------------------------------------------
-- Fix: column "status" is of type attempt_status but expression is of type text
-- Terjadi saat siswa klik Kumpulkan (submit_attempt) karena PostgreSQL 15+ strict enum cast
-- Perbaikan: explicit cast ::public.attempt_status pada semua assignment status

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
  v_essay_total   int := 0;
  v_essay_graded  int := 0;
  v_essay_score   numeric := 0;
  v_pending       boolean;
  v_final         numeric;
  v_passed        boolean;
  v_res     record;
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

  for rec in
    select eq.question_id as qid, coalesce(eq.points, q.points) as pts,
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

    v_obj := v_obj + round(rec.pts * coalesce(v_ratio, 0), 2);
    if coalesce(v_ratio, 0) >= 1 then v_ok := v_ok + 1; else v_bad := v_bad + 1; end if;
  end loop;

  select count(*) into v_essay_total
  from public.exam_questions eq join public.questions q on q.id = eq.question_id
  where eq.exam_id = v_attempt.exam_id and q.type = 'essay';

  select count(*) into v_essay_graded
  from public.essay_grades g
  where g.attempt_id = p_attempt_id and g.status = 'graded';

  select coalesce(sum(final_score), 0) into v_essay_score
  from public.essay_grades
  where attempt_id = p_attempt_id and status = 'graded';

  v_pending := v_essay_graded < v_essay_total;
  v_final   := v_obj + v_essay_score;
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
    v_ok + v_bad + v_none, v_ok, v_bad, v_none,
    v_obj, case when v_essay_total = 0 then null else v_essay_score end,
    v_final, v_passed,
    now(), extract(epoch from (now() - v_attempt.started_at))::int,
    v_attempt.violation_count
  )
  on conflict (attempt_id) do update set
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
  v_essay_total int;
  v_essay_graded int;
  v_essay_score numeric;
  v_final numeric;
begin
  select * into r from public.exam_results where attempt_id = p_attempt_id;
  if not found then return; end if;

  select * into v_exam from public.exams where id = r.exam_id;

  select count(*) into v_essay_total
  from public.exam_questions eq join public.questions q on q.id = eq.question_id
  where eq.exam_id = r.exam_id and q.type = 'essay';

  select count(*) into v_essay_graded
  from public.essay_grades g where g.attempt_id = p_attempt_id and g.status = 'graded';

  select coalesce(sum(final_score), 0) into v_essay_score
  from public.essay_grades where attempt_id = p_attempt_id and status = 'graded';

  v_final := r.objective_score + v_essay_score;

  update public.exam_results
  set essay_score = v_essay_score,
      final_score = v_final,
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

create or replace function public.cancel_attempt_admin(p_attempt_id uuid)
returns void
language plpgsql volatile security definer set search_path = public, private as $$
declare v_owner boolean;
begin
  if not private.is_admin() then raise exception 'Hanya admin.'; end if;
  select exists (
    select 1 from public.exam_participants ep
    join public.exam_attempts a on a.id = p_attempt_id
    where ep.exam_id = a.exam_id
  ) into v_owner;
  if not v_owner then raise exception 'Attempt tidak ditemukan.'; end if;

  update public.exam_attempts
  set status = 'cancelled'::public.attempt_status
  where id = p_attempt_id;

  delete from public.exam_results where attempt_id = p_attempt_id;
  perform public.log_audit('CANCEL_ATTEMPT', 'exam_attempt', p_attempt_id::text, '{}');
end $$;

-- ------------------------------------------------------------
-- SUMBER: 00027_theme_preset.sql
-- ------------------------------------------------------------
-- Hybrid theme: preset terkurasi + kustom (Opsi C)
alter table public.school_settings
  add column if not exists theme_preset text;

update public.school_settings
  set theme_preset = 'bengkel-presisi'
  where theme_preset is null;

comment on column public.school_settings.theme_preset is 'Preset tema: bengkel-presisi | veyra-midnight | kertas-blueprint | graphite-slate | custom | null (fallback ke bengkel-presisi)';

-- ------------------------------------------------------------
-- SUMBER: 00028_login_sidebar_colors.sql
-- ------------------------------------------------------------
-- 00028: Tambah warna kustom untuk login (card kiri) & sidebar
alter table public.school_settings
  add column if not exists login_color text not null default '#0B1E24',
  add column if not exists sidebar_color text not null default '#0B1E24';

comment on column public.school_settings.login_color is 'Warna latar panel kiri halaman login (card branding) — default #0B1E24';
comment on column public.school_settings.sidebar_color is 'Warna latar sidebar navigasi dashboard — default #0B1E24';

update public.school_settings
  set login_color = '#0B1E24'
  where login_color is null or login_color = '';

update public.school_settings
  set sidebar_color = '#0B1E24'
  where sidebar_color is null or sidebar_color = '';

-- ------------------------------------------------------------
-- SUMBER: 00029_theme_full_surfaces.sql
-- ------------------------------------------------------------
-- 00029: Tema penuh — background aplikasi & splash
alter table public.school_settings
  add column if not exists app_bg_color text not null default '#FDF9F3',
  add column if not exists splash_bg_color text not null default '#0B1E24';

comment on column public.school_settings.app_bg_color is 'Warna latar belakang aplikasi (body, dashboard, login kanan) — default #FDF9F3';
comment on column public.school_settings.splash_bg_color is 'Warna latar splash screen / loading awal — default #0B1E24';

update public.school_settings
  set app_bg_color = '#FDF9F3'
  where app_bg_color is null or app_bg_color = '';

update public.school_settings
  set splash_bg_color = '#0B1E24'
  where splash_bg_color is null or splash_bg_color = '';

-- ------------------------------------------------------------
-- SUMBER: 00030_card_gradients.sql
-- ------------------------------------------------------------
-- 00030: Gradasi per-card branding — setiap warna bisa di-gradasi-kan
alter table public.school_settings
  add column if not exists card_gradients jsonb not null default '{}'::jsonb;

comment on column public.school_settings.card_gradients is 'Gradasi per permukaan: { primary: string[], secondary: string[], login: string[], sidebar: string[], app_bg: string[], splash: string[] } — tiap array hex untuk gradient linear 135deg';

update public.school_settings
  set card_gradients = '{}'::jsonb
  where card_gradients is null;

-- ------------------------------------------------------------
-- SUMBER: 00031_security_events.sql
-- ------------------------------------------------------------
-- 00031: Security Event System — comprehensive anti-cheat

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  exam_id uuid references public.exams(id) on delete cascade,
  attempt_id uuid references public.exam_attempts(id) on delete cascade,
  event_type text not null,
  severity text not null default 'LOW' check (severity in ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),
  ip_address text,
  user_agent text,
  device_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_security_events_user on public.security_events(user_id);
create index if not exists idx_security_events_exam on public.security_events(exam_id);
create index if not exists idx_security_events_attempt on public.security_events(attempt_id);
create index if not exists idx_security_events_type on public.security_events(event_type);
create index if not exists idx_security_events_created on public.security_events(created_at desc);
create index if not exists idx_security_events_severity on public.security_events(severity);

alter table public.security_events enable row level security;

drop policy if exists "security_events_select_own_or_staff" on public.security_events;
create policy "security_events_select_own_or_staff" on public.security_events for select to authenticated using (
  auth.uid() = user_id
  or private.is_admin()
  or exists (
    select 1 from public.exams e
    join public.teachers t on t.id = e.teacher_id
    where e.id = security_events.exam_id
    and t.profile_id = auth.uid()
  )
);

drop policy if exists "security_events_insert_own" on public.security_events;
create policy "security_events_insert_own" on public.security_events for insert to authenticated with check (
  auth.uid() = user_id
  or private.is_admin()
);

comment on table public.security_events is 'Comprehensive security events for anti-cheat: TAB_SWITCH, PAGE_BLUR, FULLSCREEN_EXIT, etc.';

-- Risk score helper (view)
create or replace view public.security_risk_scores as
select
  attempt_id,
  exam_id,
  user_id,
  count(*) filter (where event_type in ('TAB_SWITCH','PAGE_BLUR','WINDOW_BLUR')) * 1 +
  count(*) filter (where event_type = 'FULLSCREEN_EXIT') * 1 +
  count(*) filter (where event_type in ('PAGE_RELOAD','PAGE_LEAVE')) * 1 +
  count(*) filter (where event_type in ('COPY_ATTEMPT','PASTE_ATTEMPT','CUT_ATTEMPT','CONTEXT_MENU')) * 1 +
  count(*) filter (where event_type = 'IP_CHANGE') * 2 +
  count(*) filter (where event_type = 'DEVICE_CHANGE') * 3 +
  count(*) filter (where event_type in ('MULTIPLE_DEVICE','MULTIPLE_SESSION','SESSION_CONFLICT')) * 5 as risk_score,
  case
    when count(*) filter (where event_type in ('MULTIPLE_DEVICE','MULTIPLE_SESSION','SESSION_CONFLICT')) > 0 then 'HIGH'
    when count(*) filter (where event_type in ('TAB_SWITCH','PAGE_BLUR','FULLSCREEN_EXIT','PAGE_RELOAD','COPY_ATTEMPT')) >= 6 then 'MEDIUM'
    when count(*) filter (where event_type in ('TAB_SWITCH','PAGE_BLUR','FULLSCREEN_EXIT')) >= 3 then 'LOW'
    else 'NORMAL'
  end as risk_level
from public.security_events
group by attempt_id, exam_id, user_id;

-- Helper function to record security event (bypass RLS via definer)
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

-- ------------------------------------------------------------
-- SUMBER: 00032_security_multidevice.sql
-- ------------------------------------------------------------
-- 00032: Multi-device / session detection hardening
-- Deteksi ganti device & IP saat resume, TANPA mengubah kontrak
-- start_attempt(p_exam_id, p_pin, p_user_agent, p_ip, p_device_info)
-- returns jsonb { attempt_id, resumed, deadline } yang dipakai frontend.
-- Versi sebelumnya sempat mengubah return menjadi uuid + logika
-- attempt_number yang rusak sehingga ExamRunner gagal start.

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

select 'BAGIAN_03_SELESAI' as status;