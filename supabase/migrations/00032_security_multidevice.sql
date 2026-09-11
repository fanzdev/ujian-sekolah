-- 00032: Multi-device / session detection hardening

-- ensure device_info is compared and security event logged on device change

create or replace function public.start_attempt(
  p_exam_id uuid,
  p_pin text default null,
  p_user_agent text default null,
  p_ip text default null,
  p_device_info jsonb default null
) returns uuid
language plpgsql security definer
as $$
declare
  v_student_id uuid;
  v_exam record;
  v_existing uuid;
  v_existing_device jsonb;
  v_new_device_id text;
  v_attempt_id uuid;
  v_deadline timestamptz;
begin
  select id into v_student_id from public.students where profile_id = auth.uid();
  if v_student_id is null then
    raise exception 'Hanya siswa yang dapat memulai ujian' using errcode = '45000';
  end if;

  select * into v_exam from public.exams where id = p_exam_id;
  if v_exam.id is null then raise exception 'Ujian tidak ditemukan' using errcode = '45000'; end if;
  if v_exam.status != 'published' and coalesce((v_exam.allow_outside_schedule), false) = false then
    raise exception 'Ujian belum dipublish' using errcode = '45000';
  end if;

  -- PIN check
  if v_exam.pin_code is not null and v_exam.pin_code <> '' then
    if p_pin is distinct from v_exam.pin_code then
      raise exception 'PIN salah' using errcode = '45000';
    end if;
  end if;

  -- check existing in_progress (resume)
  select id, device_info into v_existing, v_existing_device
  from public.exam_attempts
  where exam_id = p_exam_id and student_id = v_student_id and status = 'in_progress'
  order by started_at desc limit 1;

  if v_existing is not null then
    -- device change detection
    v_new_device_id := coalesce(p_device_info->>'device_id', p_device_info->>'deviceId', '');
    if v_new_device_id <> '' and v_existing_device is not null and coalesce(v_existing_device->>'device_id','') <> '' and v_new_device_id <> coalesce(v_existing_device->>'device_id','') then
      perform public.record_security_event(v_existing, 'DEVICE_CHANGE', 'HIGH', jsonb_build_object('previous_device', v_existing_device, 'new_device', p_device_info));
      perform public.record_security_event(v_existing, 'MULTIPLE_DEVICE', 'HIGH', jsonb_build_object('existing_attempt', v_existing, 'new_device', p_device_info));
    end if;
    -- also check IP change
    if p_ip is not null and p_ip <> '' then
      declare v_old_ip text;
      begin
        select ip_address into v_old_ip from public.exam_attempts where id = v_existing;
        if v_old_ip is not null and v_old_ip <> p_ip then
          perform public.record_security_event(v_existing, 'IP_CHANGE', 'MEDIUM', jsonb_build_object('previous_ip', v_old_ip, 'new_ip', p_ip));
        end if;
      exception when others then null;
      end;
    end if;
    return v_existing;
  end if;

  -- max attempts check
  declare v_used int;
  begin
    select count(*) into v_used from public.exam_attempts where exam_id = p_exam_id and student_id = v_student_id and status in ('submitted','auto_submitted','graded');
    if v_used >= v_exam.max_attempts then
      raise exception 'Batas percobaan tercapai' using errcode = '45000';
    end if;
  end;

  v_deadline := least(now() + (v_exam.duration_minutes || ' minutes')::interval, v_exam.ends_at);

  insert into public.exam_attempts (exam_id, student_id, attempt_number, status, started_at, deadline, duration_minutes, ip_address, user_agent, device_info, violation_count)
  values (p_exam_id, v_student_id, coalesce(v_used,0)+1, 'in_progress', now(), v_deadline, v_exam.duration_minutes, p_ip, p_user_agent, coalesce(p_device_info,'{}'::jsonb), 0)
  returning id into v_attempt_id;

  perform public.record_security_event(v_attempt_id, 'EXAM_START', 'INFO', jsonb_build_object('exam_id', p_exam_id));

  return v_attempt_id;
end;
$$;

grant execute on function public.start_attempt(uuid,text,text,text,jsonb) to authenticated;
