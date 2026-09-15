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
