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
create policy "security_events_select_own_or_staff" on public.security_events for select using (
  auth.uid() = user_id
  or public.is_admin()
  or exists (
    select 1 from public.exams e
    where e.id = security_events.exam_id
    and e.teacher_id = auth.uid()
  )
);

drop policy if exists "security_events_insert_own" on public.security_events;
create policy "security_events_insert_own" on public.security_events for insert with check (
  auth.uid() = user_id
  or public.is_admin()
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
language plpgsql security definer
as $$
declare
  v_user_id uuid;
  v_exam_id uuid;
  v_ip text;
  v_ua text;
  v_id uuid;
begin
  select student_id, exam_id into v_user_id, v_exam_id
  from public.exam_attempts
  where id = p_attempt_id;

  if v_user_id is null then
    -- try to get from attempt owned by current user
    select id, exam_id, student_id into v_user_id, v_exam_id, v_user_id
    from public.exam_attempts
    where id = p_attempt_id and student_id = auth.uid();
    if v_user_id is null then
      raise exception 'Attempt not found or not owned';
    end if;
  end if;

  -- allow only own or admin/teacher
  if v_user_id != auth.uid() and not public.is_admin() then
    perform public.load_attempt_checked(p_attempt_id);
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
  values (v_user_id, v_exam_id, p_attempt_id, p_event_type, coalesce(p_severity,'LOW'), v_ip, v_ua, p_device_id, coalesce(p_metadata,'{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.record_security_event(uuid,text,text,jsonb,text) to authenticated;
