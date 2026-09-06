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
