-- ============================================================
-- SMK AL-FATA CBT - SETUP LENGKAP (semua migrasi dalam 1 file)
-- Cara pakai: buka Supabase Dashboard > SQL Editor > New query,
-- tempel SELURUH isi file ini, pastikan tidak ada karakter
-- tambahan sebelum baris pertama, lalu Run.
-- Alternatif jika terlalu besar: jalankan supabase/setup/01..04 berurutan.
-- Semua perintah idempotent, aman dijalankan ulang.
-- ============================================================

-- ------------------------------------------------------------
-- SUMBER: 00001_schema.sql
-- ------------------------------------------------------------
-- ============================================================
-- SMK AL-FATA CBT — Migration 00001: Core Schema (IDEMPOTENT)
-- Aman dijalankan ulang: objek yang sudah ada akan dilewati.
-- ============================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;
create extension if not exists citext;

create schema if not exists private;
grant usage on schema private to authenticated;

-- ---------- Enumerations (idempotent) ----------
do $$ begin
  create type public.user_role as enum ('admin', 'teacher', 'student');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.gender_type as enum ('L', 'P');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.difficulty_level as enum ('easy', 'medium', 'hard');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.question_type as enum (
    'multiple_choice', 'multiple_response', 'true_false',
    'matching', 'short_answer', 'essay'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.bank_status as enum ('draft', 'published', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.exam_status as enum ('draft', 'published', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.attempt_status as enum ('in_progress', 'submitted', 'auto_submitted', 'graded', 'cancelled');
exception when duplicate_object then null; end $$;

-- ---------- updated_at helper ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ============================================================
-- PROFILES
-- ============================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    citext not null unique,
  full_name   text not null default '',
  role        public.user_role not null default 'student',
  avatar_url  text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_profiles_role     on public.profiles (role);
create index if not exists idx_profiles_username on public.profiles (username);

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

-- Auto-create profile saat user baru dibuat di Supabase Auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_username text;
  v_base     text;
  v_n        int := 0;
begin
  v_username := coalesce(nullif(new.raw_user_meta_data ->> 'username', ''),
                         split_part(coalesce(new.email, 'user'), '@', 1));
  v_base     := v_username;
  while exists (select 1 from public.profiles p where p.username = v_username) loop
    v_n        := v_n + 1;
    v_username := v_base || v_n;
  end loop;

  insert into public.profiles (id, username, full_name, role)
  values (
    new.id,
    v_username,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), v_username),
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'student')
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Cegah eskalasi role / edit lintas akun oleh non-admin
create or replace function public.guard_profile_update()
returns trigger
language plpgsql security definer set search_path = public, private
as $$
declare
  v_role public.user_role;
begin
  select private.my_role() into v_role;
  if coalesce(v_role, 'student') is distinct from 'admin' then
    if new.id <> auth.uid() then
      raise exception 'FORBIDDEN: cannot modify other profiles';
    end if;
    if new.role      is distinct from old.role
    or new.is_active is distinct from old.is_active
    or new.username  is distinct from old.username then
      raise exception 'FORBIDDEN: only admin can change role/status/username';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_profile_update on public.profiles;
create trigger trg_guard_profile_update
  before update on public.profiles
  for each row execute procedure public.guard_profile_update();

-- ============================================================
-- TEACHERS (dibuat sebelum classes agar FK homeroom valid)
-- ============================================================
create table if not exists public.teachers (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles on delete cascade,
  nip        text unique,
  phone      text,
  email      text,
  address    text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_teachers_updated on public.teachers;
create trigger trg_teachers_updated before update on public.teachers
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- DEPARTMENTS
-- ============================================================
create table if not exists public.departments (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_departments_updated on public.departments;
create trigger trg_departments_updated before update on public.departments
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- CLASSES
-- ============================================================
create table if not exists public.classes (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  level                smallint not null check (level between 10 and 13),
  department_id        uuid not null references public.departments on delete restrict,
  homeroom_teacher_id  uuid,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'classes_name_department_id_key' and conrelid = 'public.classes'::regclass
  ) then
    alter table public.classes
      add constraint classes_name_department_id_key unique (name, department_id);
  end if;
end $$;

create index if not exists idx_classes_department on public.classes (department_id);

drop trigger if exists trg_classes_updated on public.classes;
create trigger trg_classes_updated before update on public.classes
  for each row execute procedure public.set_updated_at();

-- FK wali kelas (tabel teachers sudah pasti ada di titik ini)
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_classes_homeroom' and conrelid = 'public.classes'::regclass
  ) then
    alter table public.classes
      add constraint fk_classes_homeroom
      foreign key (homeroom_teacher_id) references public.teachers on delete set null;
  end if;
end $$;

-- ============================================================
-- STUDENTS
-- ============================================================
create table if not exists public.students (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null unique references public.profiles on delete cascade,
  nis         text unique,
  nisn        text unique,
  gender      public.gender_type,
  birth_place text,
  birth_date  date,
  address     text,
  phone       text,
  email       text,
  class_id    uuid references public.classes on delete set null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_students_class   on public.students (class_id);
create index if not exists idx_students_profile on public.students (profile_id);

drop trigger if exists trg_students_updated on public.students;
create trigger trg_students_updated before update on public.students
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- SUBJECTS
-- ============================================================
create table if not exists public.subjects (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_subjects_updated on public.subjects;
create trigger trg_subjects_updated before update on public.subjects
  for each row execute procedure public.set_updated_at();

create table if not exists public.teacher_subjects (
  teacher_id uuid not null references public.teachers on delete cascade,
  subject_id uuid not null references public.subjects on delete cascade,
  primary key (teacher_id, subject_id)
);

-- ============================================================
-- QUESTION BANKS & QUESTIONS
-- ============================================================
create table if not exists public.question_banks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  subject_id  uuid references public.subjects on delete set null,
  grade_level smallint check (grade_level between 10 and 13),
  tags        text[] not null default '{}',
  status      public.bank_status not null default 'draft',
  author_id   uuid not null references public.profiles on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_banks_author  on public.question_banks (author_id);
create index if not exists idx_banks_subject on public.question_banks (subject_id);

drop trigger if exists trg_banks_updated on public.question_banks;
create trigger trg_banks_updated before update on public.question_banks
  for each row execute procedure public.set_updated_at();

create table if not exists public.questions (
  id             uuid primary key default gen_random_uuid(),
  bank_id        uuid not null references public.question_banks on delete cascade,
  type           public.question_type not null,
  text           text not null,
  media_url      text,
  media_type     text check (media_type in ('image', 'audio', 'video')),
  difficulty     public.difficulty_level not null default 'medium',
  points         numeric(6,2) not null default 1 check (points > 0),
  default_answer jsonb,
  scoring_rule   jsonb not null default '{}',
  explanation    text,
  tags           text[] not null default '{}',
  author_id      uuid not null references public.profiles on delete cascade,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_questions_bank on public.questions (bank_id);
create index if not exists idx_questions_type on public.questions (type);

drop trigger if exists trg_questions_updated on public.questions;
create trigger trg_questions_updated before update on public.questions
  for each row execute procedure public.set_updated_at();

create table if not exists public.question_options (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references public.questions on delete cascade,
  option_text  text not null default '',
  media_url    text,
  is_correct   boolean not null default false,
  position     int not null default 0
);

create index if not exists idx_options_question on public.question_options (question_id);

create table if not exists public.matching_pairs (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions on delete cascade,
  left_text   text not null,
  right_text  text not null,
  position    int not null default 0
);

create index if not exists idx_pairs_question on public.matching_pairs (question_id);

-- ============================================================
-- EXAMS
-- ============================================================
create table if not exists public.exams (
  id                     uuid primary key default gen_random_uuid(),
  title                  text not null,
  description            text,
  instructions           text,
  subject_id             uuid references public.subjects on delete set null,
  teacher_id             uuid references public.teachers on delete set null,
  created_by             uuid references public.profiles on delete set null,
  starts_at              timestamptz not null,
  ends_at                timestamptz not null,
  duration_minutes       int not null default 60 check (duration_minutes > 0),
  total_points           numeric(8,2) not null default 0,
  passing_grade          numeric(5,2) not null default 0 check (passing_grade >= 0),
  shuffle_questions      boolean not null default true,
  shuffle_options        boolean not null default true,
  max_attempts           int not null default 1 check (max_attempts between 1 and 10),
  exam_code              text unique,
  pin_code               text,
  status                 public.exam_status not null default 'draft',
  show_result_to_student boolean not null default true,
  show_answers_after     boolean not null default false,
  fullscreen_required    boolean not null default false,
  camera_monitoring      boolean not null default false,
  violation_limit        int not null default 3 check (violation_limit between 1 and 20),
  auto_submit_on_limit   boolean not null default true,
  ip_logging             boolean not null default true,
  device_logging         boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_exam_window' and conrelid = 'public.exams'::regclass
  ) then
    alter table public.exams add constraint chk_exam_window check (ends_at > starts_at);
  end if;
end $$;

create index if not exists idx_exams_status  on public.exams (status);
create index if not exists idx_exams_window  on public.exams (starts_at, ends_at);
create index if not exists idx_exams_teacher on public.exams (teacher_id);

drop trigger if exists trg_exams_updated on public.exams;
create trigger trg_exams_updated before update on public.exams
  for each row execute procedure public.set_updated_at();

create table if not exists public.exam_targets (
  id        uuid primary key default gen_random_uuid(),
  exam_id   uuid not null references public.exams on delete cascade,
  kind      text not null check (kind in ('class', 'department')),
  target_id uuid not null
);
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'exam_targets_exam_id_kind_target_id_key' and conrelid = 'public.exam_targets'::regclass
  ) then
    alter table public.exam_targets
      add constraint exam_targets_exam_id_kind_target_id_key unique (exam_id, kind, target_id);
  end if;
end $$;

create index if not exists idx_targets_exam on public.exam_targets (exam_id);

create table if not exists public.exam_participants (
  exam_id    uuid not null references public.exams on delete cascade,
  student_id uuid not null references public.students on delete cascade,
  is_removed boolean not null default false,
  added_by   uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  primary key (exam_id, student_id)
);

create index if not exists idx_participants_student on public.exam_participants (student_id);

create table if not exists public.exam_questions (
  exam_id     uuid not null references public.exams on delete cascade,
  question_id uuid not null references public.questions on delete cascade,
  position    int not null default 0,
  points      numeric(6,2),
  primary key (exam_id, question_id)
);

create index if not exists idx_exam_questions_position on public.exam_questions (exam_id, position);

-- ============================================================
-- ATTEMPTS / ANSWERS / RESULTS
-- ============================================================
create table if not exists public.exam_attempts (
  id               uuid primary key default gen_random_uuid(),
  exam_id          uuid not null references public.exams on delete cascade,
  student_id       uuid not null references public.students on delete cascade,
  attempt_number   int not null check (attempt_number >= 1),
  status           public.attempt_status not null default 'in_progress',
  started_at       timestamptz not null default now(),
  deadline         timestamptz not null,
  duration_minutes int not null,
  submitted_at     timestamptz,
  question_order   jsonb not null default '[]',
  option_orders    jsonb not null default '{}',
  match_orders     jsonb not null default '{}',
  violation_count  int not null default 0,
  last_activity_at timestamptz,
  ip_address       text,
  user_agent       text,
  device_info      jsonb
);
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'exam_attempts_exam_id_student_id_attempt_number_key'
      and conrelid = 'public.exam_attempts'::regclass
  ) then
    alter table public.exam_attempts
      add constraint exam_attempts_exam_id_student_id_attempt_number_key
      unique (exam_id, student_id, attempt_number);
  end if;
end $$;

create index if not exists idx_attempts_exam    on public.exam_attempts (exam_id);
create index if not exists idx_attempts_student on public.exam_attempts (student_id);
create index if not exists idx_attempts_status  on public.exam_attempts (status);

create table if not exists public.answers (
  id          uuid primary key default gen_random_uuid(),
  attempt_id  uuid not null references public.exam_attempts on delete cascade,
  question_id uuid not null references public.questions on delete cascade,
  value       jsonb,
  updated_at  timestamptz not null default now()
);
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'answers_attempt_id_question_id_key' and conrelid = 'public.answers'::regclass
  ) then
    alter table public.answers
      add constraint answers_attempt_id_question_id_key unique (attempt_id, question_id);
  end if;
end $$;

create index if not exists idx_answers_attempt on public.answers (attempt_id);

create table if not exists public.essay_grades (
  attempt_id     uuid not null references public.exam_attempts on delete cascade,
  question_id    uuid not null references public.questions on delete cascade,
  ai_score       numeric(6,2),
  ai_feedback    text,
  ai_confidence  numeric(4,3),
  ai_provider    text,
  final_score    numeric(6,2),
  final_feedback text,
  graded_by      uuid references public.profiles on delete set null,
  graded_at      timestamptz,
  status         text not null default 'pending' check (status in ('pending','ai_graded','graded')),
  primary key (attempt_id, question_id)
);

create table if not exists public.exam_results (
  attempt_id       uuid primary key references public.exam_attempts on delete cascade,
  exam_id          uuid not null references public.exams on delete cascade,
  student_id       uuid not null references public.students on delete cascade,
  total_questions  int not null default 0,
  correct_count    int not null default 0,
  wrong_count      int not null default 0,
  unanswered_count int not null default 0,
  objective_score  numeric(8,2) not null default 0,
  essay_score      numeric(8,2),
  final_score      numeric(8,2),
  passed           boolean,
  submitted_at     timestamptz,
  duration_seconds int,
  violation_count  int not null default 0,
  updated_at       timestamptz not null default now()
);

create index if not exists idx_results_exam    on public.exam_results (exam_id);
create index if not exists idx_results_student on public.exam_results (student_id);

create table if not exists public.exam_violations (
  id             uuid primary key default gen_random_uuid(),
  attempt_id     uuid not null references public.exam_attempts on delete cascade,
  exam_id        uuid not null references public.exams on delete cascade,
  student_id     uuid not null references public.students on delete cascade,
  violation_type text not null,
  severity       text not null default 'warning' check (severity in ('warning','serious','critical')),
  metadata       jsonb not null default '{}',
  ip_address     text,
  user_agent     text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_violations_attempt on public.exam_violations (attempt_id);
create index if not exists idx_violations_exam    on public.exam_violations (exam_id);

-- ============================================================
-- SYSTEM TABLES
-- ============================================================
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles on delete set null,
  actor_role  public.user_role,
  action      text not null,
  resource    text,
  resource_id text,
  metadata    jsonb not null default '{}',
  ip_address  text,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_audit_actor  on public.audit_logs (actor_id);
create index if not exists idx_audit_action on public.audit_logs (action);
create index if not exists idx_audit_created on public.audit_logs (created_at desc);

create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles on delete cascade,
  title        text not null,
  body         text,
  type         text not null default 'info',
  link_path    text,
  is_read      boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists idx_notifications_recipient on public.notifications (recipient_id, is_read);

create table if not exists public.system_settings (
  key        text primary key,
  value      jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles on delete set null
);

create table if not exists public.school_settings (
  id              boolean primary key default true check (id),
  app_name        text not null default 'SMK AL-FATA CBT',
  school_name     text not null default 'SMK AL-FATA',
  logo_url        text,
  favicon_url     text,
  primary_color   text not null default '#2563eb',
  secondary_color text not null default '#0ea5e9',
  address         text,
  city            text,
  headmaster      text,
  academic_year   text,
  semester        text,
  updated_at      timestamptz not null default now()
);

drop trigger if exists trg_school_settings_updated on public.school_settings;
create trigger trg_school_settings_updated before update on public.school_settings
  for each row execute procedure public.set_updated_at();

create table if not exists public.media_files (
  id         uuid primary key default gen_random_uuid(),
  bucket     text not null default 'media',
  path       text not null unique,
  mime_type  text,
  size_bytes bigint,
  purpose    text not null default 'other',
  owner_id   uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- SUMBER: 00002_functions.sql
-- ------------------------------------------------------------
-- ============================================================
-- SMK AL-FATA CBT — Migration 00002: Server-side API (SECURITY DEFINER)
-- Semua operasi sensitif ujian dijalankan di database.
-- Answer key TIDAK PERNAH dikirim ke client sebelum waktunya.
-- ============================================================

create or replace function public.get_server_time()
returns timestamptz language sql volatile as
$$ select now() $$;

create or replace function private.shuffle(arr uuid[])
returns uuid[] language plpgsql immutable as $$
declare
  i int;
  j int;
  tmp uuid;
begin
  for i in reverse coalesce(array_length(arr, 1), 1)..2 loop
    j := 1 + floor(random() * i)::int;
    tmp := arr[j]; arr[j] := arr[i]; arr[i] := tmp;
  end loop;
  return arr;
end $$;

create or replace function private.norm_text(t text)
returns text language sql immutable as
$$ select lower(trim(regexp_replace(coalesce(t, ''), '\s+', ' ', 'g'))) $$;

create or replace function private.exam_allows_student(p_exam_id uuid, p_student_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select
    not exists (
      select 1 from public.exam_participants ep
      where ep.exam_id = p_exam_id and ep.student_id = p_student_id and ep.is_removed
    )
    and (
      exists (
        select 1 from public.exam_participants ep
        where ep.exam_id = p_exam_id and ep.student_id = p_student_id and not ep.is_removed
      )
      or exists (
        select 1
        from public.exam_targets t
        join public.students s on s.id = p_student_id
        join public.classes c on c.id = s.class_id
        where t.exam_id = p_exam_id
          and ((t.kind = 'class' and t.target_id = c.id)
            or (t.kind = 'department' and t.target_id = c.department_id))
      )
    )
$$;

create or replace function public.log_audit(
  p_action text,
  p_resource text default null,
  p_resource_id text default null,
  p_metadata jsonb default '{}'
)
returns void
language plpgsql security definer set search_path = public, private as $$
begin
  insert into public.audit_logs (actor_id, actor_role, action, resource, resource_id, metadata)
  values (private.my_uid(), private.my_role(), upper(p_action), p_resource, p_resource_id, p_metadata);
end $$;

create or replace function public.notify_user(
  p_recipient uuid,
  p_title text,
  p_body text default null,
  p_type text default 'info',
  p_link text default null
)
returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (recipient_id, title, body, type, link_path)
  values (p_recipient, p_title, p_body, p_type, p_link)
$$;

create or replace function public.notify_participants_exam(
  p_exam_id uuid,
  p_title text,
  p_body text default null,
  p_type text default 'info',
  p_link text default null
)
returns void
language plpgsql security definer set search_path = public, private as $$
begin
  insert into public.notifications (recipient_id, title, body, type, link_path)
  select s.profile_id, p_title, p_body, p_type, p_link
  from public.students s
  where s.is_active and private.exam_allows_student(p_exam_id, s.id);
end $$;

-- ------------------------------------------------------------
-- STUDENT: list exams assigned to me
-- ------------------------------------------------------------
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
      'show_result_to_student', rec.show_result_to_student,
      'status_for_me', v_state,
      'active_attempt_id', v_active,
      'best_score', v_best
    );
  end loop;

  return v_res;
end $$;

-- ------------------------------------------------------------
-- STUDENT: start (or resume) an attempt
-- ------------------------------------------------------------
create or replace function public.start_attempt(p_exam_id uuid, p_pin text default null, p_user_agent text default null, p_ip text default null, p_device_info jsonb default null)
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

-- ------------------------------------------------------------
-- Shared: load attempt + verify caller permission
-- ------------------------------------------------------------
create or replace function private.load_attempt_checked(p_attempt_id uuid)
returns public.exam_attempts
language plpgsql stable security definer set search_path = public, private as $$
declare
  v_attempt public.exam_attempts%rowtype;
  v_exam    public.exams%rowtype;
begin
  select * into v_attempt from public.exam_attempts where id = p_attempt_id;
  if not found then raise exception 'Attempt tidak ditemukan.'; end if;

  select * into v_exam from public.exams where id = v_attempt.exam_id;

  if exists (select 1 from public.students s where s.id = v_attempt.student_id and s.profile_id = auth.uid())
    or private.is_admin()
    or (private.my_teacher_id() is not null
        and (v_exam.teacher_id = private.my_teacher_id() or v_exam.created_by = auth.uid())) then
    return v_attempt;
  end if;

  raise exception 'Akses ditolak.';
end $$;

-- ------------------------------------------------------------
-- Attempt payload for the exam runner (sanitized!)
-- ------------------------------------------------------------
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

  select s.nis, p.full_name, c.name as class_name, d.name as dept_name
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

-- ------------------------------------------------------------
-- Autosave answer (idempotent upsert)
-- ------------------------------------------------------------
create or replace function public.save_answer(
  p_attempt_id uuid,
  p_question_id uuid,
  p_value jsonb
)
returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  v_attempt public.exam_attempts%rowtype;
begin
  select * into v_attempt from public.exam_attempts where id = p_attempt_id for update;
  if not found then raise exception 'Attempt tidak ditemukan.'; end if;

  if not exists (
    select 1 from public.students s
    where s.id = v_attempt.student_id and s.profile_id = auth.uid()
  ) then
    raise exception 'Akses ditolak.';
  end if;

  if v_attempt.status <> 'in_progress' then
    raise exception 'Ujian sudah dikumpulkan.';
  end if;
  if now() > v_attempt.deadline + interval '90 seconds' then
    raise exception 'Waktu ujian telah habis.';
  end if;

  insert into public.answers (attempt_id, question_id, value, updated_at)
  values (p_attempt_id, p_question_id, p_value, now())
  on conflict (attempt_id, question_id)
  do update set value = excluded.value, updated_at = now();

  update public.exam_attempts
  set last_activity_at = now()
  where id = p_attempt_id;

  return jsonb_build_object('ok', true, 'saved_at', now());
end $$;

-- ------------------------------------------------------------
-- Submit attempt + grade objective questions server-side
-- ------------------------------------------------------------
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
  set status = case when p_auto then 'auto_submitted' else 'submitted' end,
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

-- ------------------------------------------------------------
-- Violations with auto-submit enforcement
-- ------------------------------------------------------------
create or replace function public.record_violation(
  p_attempt_id uuid,
  p_violation_type text,
  p_severity text default 'warning',
  p_metadata jsonb default '{}'
)
returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  v_attempt public.exam_attempts%rowtype;
  v_exam    public.exams%rowtype;
  v_count   int;
  v_submitted boolean := false;
begin
  select * into v_attempt from public.exam_attempts where id = p_attempt_id for update;
  if not found then return jsonb_build_object('ignored', true); end if;

  if not exists (
    select 1 from public.students s
    where s.id = v_attempt.student_id and s.profile_id = auth.uid()
  ) then
    raise exception 'Akses ditolak.';
  end if;

  if v_attempt.status <> 'in_progress' then
    return jsonb_build_object('count', v_attempt.violation_count, 'submitted', false);
  end if;

  select * into v_exam from public.exams where id = v_attempt.exam_id;

  insert into public.exam_violations (
    attempt_id, exam_id, student_id, violation_type, severity, metadata, user_agent
  ) values (
    p_attempt_id, v_attempt.exam_id, v_attempt.student_id,
    p_violation_type, p_severity, p_metadata,
    nullif(left(current_setting('request.headers', true)::json ->> 'user-agent', 500), '')
  );

  update public.exam_attempts
  set violation_count = violation_count + 1
  where id = p_attempt_id
  returning violation_count into v_count;

  perform public.log_audit('VIOLATION', 'exam_attempt', p_attempt_id::text,
                           jsonb_build_object('type', p_violation_type, 'count', v_count));

  if v_count >= v_exam.violation_limit and v_exam.auto_submit_on_limit then
    perform public.submit_attempt(p_attempt_id, true);
    v_submitted := true;
  end if;

  return jsonb_build_object('count', v_count, 'limit', v_exam.violation_limit, 'submitted', v_submitted);
end $$;

-- ------------------------------------------------------------
-- Recalculate final score after essay grading
-- ------------------------------------------------------------
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
    set status = 'graded'
    where id = p_attempt_id and status in ('submitted', 'auto_submitted');
  end if;
end $$;

-- ------------------------------------------------------------
-- Admin utilities
-- ------------------------------------------------------------
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
  set status = 'cancelled'
  where id = p_attempt_id;

  delete from public.exam_results where attempt_id = p_attempt_id;
  perform public.log_audit('CANCEL_ATTEMPT', 'exam_attempt', p_attempt_id::text, '{}');
end $$;

-- ------------------------------------------------------------
-- SUMBER: 00003_triggers.sql
-- ------------------------------------------------------------
-- ============================================================
-- SMK AL-FATA CBT — Migration 00003: Triggers
-- ============================================================

-- Recompute exams.total_points whenever exam_questions change
create or replace function public.recalc_exam_total_points()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_exam uuid := coalesce(new.exam_id, old.exam_id);
begin
  update public.exams e
  set total_points = coalesce((
    select sum(coalesce(eq.points, q.points))
    from public.exam_questions eq
    join public.questions q on q.id = eq.question_id
    where eq.exam_id = v_exam
  ), 0)
  where e.id = v_exam;
  return null;
end $$;

drop trigger if exists trg_recalc_points_ins on public.exam_questions;
create constraint trigger trg_recalc_points_ins
  after insert on public.exam_questions deferrable initially deferred
  for each row execute procedure public.recalc_exam_total_points();
drop trigger if exists trg_recalc_points_upd on public.exam_questions;
create constraint trigger trg_recalc_points_upd
  after update of points on public.exam_questions deferrable initially deferred
  for each row execute procedure public.recalc_exam_total_points();
drop trigger if exists trg_recalc_points_del on public.exam_questions;
create constraint trigger trg_recalc_points_del
  after delete on public.exam_questions deferrable initially deferred
  for each row execute procedure public.recalc_exam_total_points();

-- Populate exam_participants based on targets (class / department)
create or replace function public.sync_exam_participants(p_exam_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.exam_participants (exam_id, student_id, added_by)
  select p_exam_id, s.id, null
  from public.students s
  join public.classes c on c.id = s.class_id
  where s.is_active
    and exists (
      select 1 from public.exam_targets t
      where t.exam_id = p_exam_id
        and ((t.kind = 'class' and t.target_id = c.id)
          or (t.kind = 'department' and t.target_id = c.department_id))
    )
  on conflict (exam_id, student_id) do nothing;
end $$;

create or replace function public.trg_populate_participants()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.sync_exam_participants(new.exam_id);
  return null;
end $$;

drop trigger if exists trg_targets_populate on public.exam_targets;
create trigger trg_targets_populate
  after insert on public.exam_targets
  for each row execute procedure public.trg_populate_participants();

-- Re-sync participants when a student moves class
create or replace function public.trg_student_class_changed()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_exam uuid;
begin
  if tg_op = 'UPDATE' and new.class_id is not distinct from old.class_id then
    return null;
  end if;

  for v_exam in
    select distinct t.exam_id
    from public.exam_targets t
    join public.classes c on c.id = new.class_id
    join public.exams e on e.id = t.exam_id
    where ((t.kind = 'class' and t.target_id = c.id)
        or (t.kind = 'department' and t.target_id = c.department_id))
      and e.status in ('draft', 'published')
  loop
    perform public.sync_exam_participants(v_exam);
  end loop;
  return null;
end $$;

drop trigger if exists trg_students_resync on public.students;
create trigger trg_students_resync
  after insert or update of class_id on public.students
  for each row execute procedure public.trg_student_class_changed();

-- Recalculate final score whenever an essay grade is written
create or replace function public.trg_essay_grade_written()
returns trigger
language plpgsql security definer set search_path = public, private
as $$
begin
  perform public.recalc_result(new.attempt_id);
  return null;
end $$;

drop trigger if exists trg_essay_grades_recalc on public.essay_grades;
create trigger trg_essay_grades_recalc
  after insert or update on public.essay_grades
  for each row execute procedure public.trg_essay_grade_written();

-- ------------------------------------------------------------
-- SUMBER: 00004_rls.sql
-- ------------------------------------------------------------
-- ============================================================
-- SMK AL-FATA CBT — Migration 00004: RLS (Row Level Security)
-- RLS adalah security boundary. Frontend authorization hanyalah UX.
-- ============================================================

-- ---------- Helper functions ----------
create or replace function private.my_uid()
returns uuid language sql stable as
$$ select auth.uid() $$;

create or replace function private.my_role()
returns public.user_role
language sql stable security definer set search_path = public as
$$ select p.role from public.profiles p where p.id = auth.uid() $$;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = public as
$$ select private.my_role() = 'admin' $$;

create or replace function private.my_teacher_id()
returns uuid language sql stable security definer set search_path = public as
$$ select t.id from public.teachers t where t.profile_id = auth.uid() $$;

create or replace function private.my_student_id()
returns uuid language sql stable security definer set search_path = public as
$$ select s.id from public.students s where s.profile_id = auth.uid() $$;

create or replace function private.exam_owned_by_me(p_exam_id uuid)
returns boolean language sql stable security definer set search_path = public as
$$ select exists (
  select 1 from public.exams e
  where e.id = p_exam_id
    and (e.created_by = auth.uid() or e.teacher_id = private.my_teacher_id())
) $$;

-- ============================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================
alter table public.profiles           enable row level security;
alter table public.departments        enable row level security;
alter table public.classes            enable row level security;
alter table public.teachers           enable row level security;
alter table public.students           enable row level security;
alter table public.subjects           enable row level security;
alter table public.teacher_subjects   enable row level security;
alter table public.question_banks     enable row level security;
alter table public.questions          enable row level security;
alter table public.question_options   enable row level security;
alter table public.matching_pairs     enable row level security;
alter table public.exams              enable row level security;
alter table public.exam_targets       enable row level security;
alter table public.exam_participants  enable row level security;
alter table public.exam_questions     enable row level security;
alter table public.exam_attempts      enable row level security;
alter table public.answers            enable row level security;
alter table public.essay_grades       enable row level security;
alter table public.exam_results       enable row level security;
alter table public.exam_violations    enable row level security;
alter table public.audit_logs         enable row level security;
alter table public.notifications      enable row level security;
alter table public.system_settings    enable row level security;
alter table public.school_settings    enable row level security;
alter table public.media_files        enable row level security;

-- ============================================================
-- PROFILES
-- insert ditangani trigger on_auth_user_created / Edge Function (service role).
-- ============================================================
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select to authenticated
  using (
    id = private.my_uid()
    or private.is_admin()
    or private.my_role() = 'teacher'
  );

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin" on public.profiles for update to authenticated
  using (id = private.my_uid() or private.is_admin())
  with check (id = private.my_uid() or private.is_admin());

drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin" on public.profiles for delete to authenticated
  using (private.is_admin());

-- ============================================================
-- ACADEMIC TABLES — read: semua user terautentikasi; write: admin
-- ============================================================
drop policy if exists "departments_select" on public.departments;
create policy "departments_select" on public.departments for select to authenticated using (true);
drop policy if exists "departments_write_admin" on public.departments;
create policy "departments_write_admin" on public.departments for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

drop policy if exists "classes_select" on public.classes;
create policy "classes_select" on public.classes for select to authenticated using (true);
drop policy if exists "classes_write_admin" on public.classes;
create policy "classes_write_admin" on public.classes for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

drop policy if exists "subjects_select" on public.subjects;
create policy "subjects_select" on public.subjects for select to authenticated using (true);
drop policy if exists "subjects_write_admin" on public.subjects;
create policy "subjects_write_admin" on public.subjects for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

drop policy if exists "teacher_subjects_select" on public.teacher_subjects;
create policy "teacher_subjects_select" on public.teacher_subjects for select to authenticated using (true);
drop policy if exists "teacher_subjects_write_admin" on public.teacher_subjects;
create policy "teacher_subjects_write_admin" on public.teacher_subjects for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- TEACHERS
drop policy if exists "teachers_select" on public.teachers;
create policy "teachers_select" on public.teachers for select to authenticated using (true);
drop policy if exists "teachers_insert_admin" on public.teachers;
create policy "teachers_insert_admin" on public.teachers for insert to authenticated
  with check (private.is_admin());
drop policy if exists "teachers_update_admin_or_self" on public.teachers;
create policy "teachers_update_admin_or_self" on public.teachers for update to authenticated
  using (private.is_admin() or profile_id = private.my_uid())
  with check (private.is_admin() or profile_id = private.my_uid());
drop policy if exists "teachers_delete_admin" on public.teachers;
create policy "teachers_delete_admin" on public.teachers for delete to authenticated
  using (private.is_admin());

-- STUDENTS: staff baca; siswa hanya data sendiri; tulis: admin
drop policy if exists "students_select" on public.students;
create policy "students_select" on public.students for select to authenticated
  using (profile_id = private.my_uid() or private.is_admin() or private.my_role() = 'teacher');
drop policy if exists "students_insert_admin" on public.students;
create policy "students_insert_admin" on public.students for insert to authenticated
  with check (private.is_admin());
drop policy if exists "students_update_admin" on public.students;
create policy "students_update_admin" on public.students for update to authenticated
  using (private.is_admin()) with check (private.is_admin());
drop policy if exists "students_delete_admin" on public.students;
create policy "students_delete_admin" on public.students for delete to authenticated
  using (private.is_admin());

-- ============================================================
-- QUESTION BANKS & QUESTIONS
-- Siswa TIDAK punya akses langsung (answer key tidak pernah keluar dari DB).
-- ============================================================
drop policy if exists "banks_select" on public.question_banks;
create policy "banks_select" on public.question_banks for select to authenticated
  using (
    private.is_admin()
    or author_id = private.my_uid()
    or (status = 'published' and private.my_role() = 'teacher')
  );
drop policy if exists "banks_insert_own" on public.question_banks;
create policy "banks_insert_own" on public.question_banks for insert to authenticated
  with check (author_id = private.my_uid());
drop policy if exists "banks_update_own_or_admin" on public.question_banks;
create policy "banks_update_own_or_admin" on public.question_banks for update to authenticated
  using (private.is_admin() or author_id = private.my_uid())
  with check (private.is_admin() or author_id = private.my_uid());
drop policy if exists "banks_delete_own_or_admin" on public.question_banks;
create policy "banks_delete_own_or_admin" on public.question_banks for delete to authenticated
  using (private.is_admin() or author_id = private.my_uid());

drop policy if exists "questions_select" on public.questions;
create policy "questions_select" on public.questions for select to authenticated
  using (
    exists (
      select 1 from public.question_banks b
      where b.id = bank_id
        and (private.is_admin()
             or b.author_id = private.my_uid()
             or (b.status = 'published' and private.my_role() = 'teacher'))
    )
  );
drop policy if exists "questions_write_via_bank" on public.questions;
create policy "questions_write_via_bank" on public.questions for all to authenticated
  using (
    exists (
      select 1 from public.question_banks b
      where b.id = bank_id and (private.is_admin() or b.author_id = private.my_uid())
    )
  )
  with check (
    exists (
      select 1 from public.question_banks b
      where b.id = bank_id and (private.is_admin() or b.author_id = private.my_uid())
    )
  );

drop policy if exists "options_select" on public.question_options;
create policy "options_select" on public.question_options for select to authenticated
  using (
    exists (
      select 1 from public.questions q join public.question_banks b on b.id = q.bank_id
      where q.id = question_id
        and (private.is_admin()
             or b.author_id = private.my_uid()
             or (b.status = 'published' and private.my_role() = 'teacher'))
    )
  );
drop policy if exists "options_write_via_bank" on public.question_options;
create policy "options_write_via_bank" on public.question_options for all to authenticated
  using (
    exists (
      select 1 from public.questions q join public.question_banks b on b.id = q.bank_id
      where q.id = question_id and (private.is_admin() or b.author_id = private.my_uid())
    )
  )
  with check (
    exists (
      select 1 from public.questions q join public.question_banks b on b.id = q.bank_id
      where q.id = question_id and (private.is_admin() or b.author_id = private.my_uid())
    )
  );

drop policy if exists "pairs_select" on public.matching_pairs;
create policy "pairs_select" on public.matching_pairs for select to authenticated
  using (
    exists (
      select 1 from public.questions q join public.question_banks b on b.id = q.bank_id
      where q.id = question_id
        and (private.is_admin()
             or b.author_id = private.my_uid()
             or (b.status = 'published' and private.my_role() = 'teacher'))
    )
  );
drop policy if exists "pairs_write_via_bank" on public.matching_pairs;
create policy "pairs_write_via_bank" on public.matching_pairs for all to authenticated
  using (
    exists (
      select 1 from public.questions q join public.question_banks b on b.id = q.bank_id
      where q.id = question_id and (private.is_admin() or b.author_id = private.my_uid())
    )
  )
  with check (
    exists (
      select 1 from public.questions q join public.question_banks b on b.id = q.bank_id
      where q.id = question_id and (private.is_admin() or b.author_id = private.my_uid())
    )
  );

-- ============================================================
-- EXAMS + TABEL ANAK
-- Siswa TIDAK PERNAH query exams langsung — melalui RPC payload.
-- ============================================================
drop policy if exists "exams_select_staff" on public.exams;
create policy "exams_select_staff" on public.exams for select to authenticated
  using (private.is_admin() or created_by = private.my_uid() or teacher_id = private.my_teacher_id());
drop policy if exists "exams_insert_staff" on public.exams;
create policy "exams_insert_staff" on public.exams for insert to authenticated
  with check (private.is_admin() or private.my_role() = 'teacher');
drop policy if exists "exams_update_owner" on public.exams;
create policy "exams_update_owner" on public.exams for update to authenticated
  using (private.is_admin() or created_by = private.my_uid() or teacher_id = private.my_teacher_id())
  with check (private.is_admin() or created_by = private.my_uid() or teacher_id = private.my_teacher_id());
drop policy if exists "exams_delete_owner" on public.exams;
create policy "exams_delete_owner" on public.exams for delete to authenticated
  using (private.is_admin() or created_by = private.my_uid() or teacher_id = private.my_teacher_id());

drop policy if exists "targets_staff" on public.exam_targets;
create policy "targets_staff" on public.exam_targets for all to authenticated
  using (private.is_admin() or private.exam_owned_by_me(exam_id))
  with check (private.is_admin() or private.exam_owned_by_me(exam_id));

drop policy if exists "participants_staff" on public.exam_participants;
create policy "participants_staff" on public.exam_participants for all to authenticated
  using (private.is_admin() or private.exam_owned_by_me(exam_id))
  with check (private.is_admin() or private.exam_owned_by_me(exam_id));

drop policy if exists "exam_questions_staff" on public.exam_questions;
create policy "exam_questions_staff" on public.exam_questions for all to authenticated
  using (private.is_admin() or private.exam_owned_by_me(exam_id))
  with check (private.is_admin() or private.exam_owned_by_me(exam_id));

-- ============================================================
-- ATTEMPTS / ANSWERS / GRADES / RESULTS / VIOLATIONS
-- insert/update attempt & results hanya via SECURITY DEFINER RPC.
-- ============================================================
drop policy if exists "attempts_select" on public.exam_attempts;
create policy "attempts_select" on public.exam_attempts for select to authenticated
  using (
    student_id = private.my_student_id()
    or private.is_admin()
    or private.exam_owned_by_me(exam_id)
  );
drop policy if exists "attempts_delete_admin" on public.exam_attempts;
create policy "attempts_delete_admin" on public.exam_attempts for delete to authenticated
  using (private.is_admin());

drop policy if exists "answers_select" on public.answers;
create policy "answers_select" on public.answers for select to authenticated
  using (
    exists (
      select 1 from public.exam_attempts a
      where a.id = attempt_id
        and (a.student_id = private.my_student_id()
             or private.is_admin()
             or private.exam_owned_by_me(a.exam_id))
    )
  );
drop policy if exists "answers_insert_own_active" on public.answers;
create policy "answers_insert_own_active" on public.answers for insert to authenticated
  with check (
    exists (
      select 1 from public.exam_attempts a
      where a.id = attempt_id
        and a.student_id = private.my_student_id()
        and a.status = 'in_progress'
    )
  );
drop policy if exists "answers_update_own_active" on public.answers;
create policy "answers_update_own_active" on public.answers for update to authenticated
  using (
    exists (
      select 1 from public.exam_attempts a
      where a.id = attempt_id
        and a.student_id = private.my_student_id()
        and a.status = 'in_progress'
    )
  )
  with check (
    exists (
      select 1 from public.exam_attempts a
      where a.id = attempt_id
        and a.student_id = private.my_student_id()
        and a.status = 'in_progress'
    )
  );
drop policy if exists "answers_delete_admin" on public.answers;
create policy "answers_delete_admin" on public.answers for delete to authenticated
  using (private.is_admin());

drop policy if exists "essay_grades_select" on public.essay_grades;
create policy "essay_grades_select" on public.essay_grades for select to authenticated
  using (
    exists (
      select 1 from public.exam_attempts a join public.exams e on e.id = a.exam_id
      where a.id = attempt_id
        and (private.is_admin()
             or private.exam_owned_by_me(a.exam_id)
             or (a.student_id = private.my_student_id() and e.show_result_to_student))
    )
  );
drop policy if exists "essay_grades_write_grader" on public.essay_grades;
create policy "essay_grades_write_grader" on public.essay_grades for all to authenticated
  using (
    exists (
      select 1 from public.exam_attempts a
      where a.id = attempt_id
        and (private.is_admin() or private.exam_owned_by_me(a.exam_id))
    )
  )
  with check (
    exists (
      select 1 from public.exam_attempts a
      where a.id = attempt_id
        and (private.is_admin() or private.exam_owned_by_me(a.exam_id))
    )
  );

drop policy if exists "results_select" on public.exam_results;
create policy "results_select" on public.exam_results for select to authenticated
  using (
    private.is_admin()
    or private.exam_owned_by_me(exam_id)
    or (
      student_id = private.my_student_id()
      and exists (
        select 1 from public.exams e where e.id = exam_id and e.show_result_to_student
      )
    )
  );
drop policy if exists "results_delete_admin" on public.exam_results;
create policy "results_delete_admin" on public.exam_results for delete to authenticated
  using (private.is_admin());

drop policy if exists "violations_select_staff" on public.exam_violations;
create policy "violations_select_staff" on public.exam_violations for select to authenticated
  using (private.is_admin() or private.exam_owned_by_me(exam_id));
drop policy if exists "violations_delete_admin" on public.exam_violations;
create policy "violations_delete_admin" on public.exam_violations for delete to authenticated
  using (private.is_admin());

-- ============================================================
-- SYSTEM TABLES
-- ============================================================
drop policy if exists "audit_select_admin" on public.audit_logs;
create policy "audit_select_admin" on public.audit_logs for select to authenticated
  using (private.is_admin());

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications for select to authenticated
  using (recipient_id = private.my_uid() or private.is_admin());
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications for update to authenticated
  using (recipient_id = private.my_uid() or private.is_admin())
  with check (recipient_id = private.my_uid() or private.is_admin());
drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications for delete to authenticated
  using (recipient_id = private.my_uid() or private.is_admin());
drop policy if exists "notifications_insert_admin" on public.notifications;
create policy "notifications_insert_admin" on public.notifications for insert to authenticated
  with check (private.is_admin());

drop policy if exists "system_settings_select" on public.system_settings;
create policy "system_settings_select" on public.system_settings for select to authenticated using (true);
drop policy if exists "system_settings_write_admin" on public.system_settings;
create policy "system_settings_write_admin" on public.system_settings for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

drop policy if exists "school_settings_read_public" on public.school_settings;
create policy "school_settings_read_public" on public.school_settings for select
  to anon, authenticated using (true);
drop policy if exists "school_settings_write_admin" on public.school_settings;
create policy "school_settings_write_admin" on public.school_settings for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

drop policy if exists "media_files_select" on public.media_files;
create policy "media_files_select" on public.media_files for select to authenticated
  using (owner_id = private.my_uid() or private.is_admin() or private.my_role() = 'teacher');
drop policy if exists "media_files_insert_own" on public.media_files;
create policy "media_files_insert_own" on public.media_files for insert to authenticated
  with check (owner_id = private.my_uid());
drop policy if exists "media_files_delete_own_or_admin" on public.media_files;
create policy "media_files_delete_own_or_admin" on public.media_files for delete to authenticated
  using (owner_id = private.my_uid() or private.is_admin());

-- ------------------------------------------------------------
-- SUMBER: 00005_storage_seed.sql
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- SUMBER: 00006_ai_keys.sql
-- ------------------------------------------------------------
-- ============================================================
-- SMK AL-FATA CBT — Migration 00006: AI Provider Keys (OpenRouter)
-- Pool banyak API KEY dengan rotasi otomatis saat rate-limit.
-- Hanya ADMIN yang dapat melihat/mengelola tabel ini (RLS total).
-- ============================================================

create table if not exists public.ai_provider_keys (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null default 'openrouter',
  label        text not null default '',
  api_key      text not null,
  model        text,
  priority     int not null default 100,
  is_active    boolean not null default true,
  last_error   text,
  last_used_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_ai_keys_order on public.ai_provider_keys (provider, is_active, priority, created_at);

drop trigger if exists trg_ai_keys_updated on public.ai_provider_keys;
create trigger trg_ai_keys_updated before update on public.ai_provider_keys
  for each row execute procedure public.set_updated_at();

alter table public.ai_provider_keys enable row level security;

drop policy if exists "ai_keys_admin_only" on public.ai_provider_keys;
create policy "ai_keys_admin_only" on public.ai_provider_keys for all to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- Konfigurasi global AI (provider & model default)
-- Batalkan RLS sementara agar seed bisa dijalankan dari migration
alter table public.system_settings disable row level security;

insert into public.system_settings (key, value) values
  ('ai', '{ "provider": "openrouter", "model": "meta-llama/llama-3.3-70b-instruct", "temperature": 0.2 }')
on conflict (key) do nothing;

alter table public.system_settings enable row level security;

-- ------------------------------------------------------------
-- SUMBER: 00007_setup_bootstrap.sql
-- ------------------------------------------------------------
-- ============================================================
-- SMK AL-FATA CBT — Migration 00007: First-run Setup Bootstrap
-- Jika belum ada admin → wizard setup tersedia (sekali pakai).
-- Setelah selesai → terkunci permanen (berbasis flag, bukan jumlah admin),
-- sehingga menghapus admin tidak akan membuka kembali celah setup.
-- ============================================================

-- Flag status setup; otomatis "done" bila ternyata admin sudah ada
-- (aman untuk database yang sudah berjalan).
insert into public.system_settings (key, value)
values (
  'setup_completed',
  jsonb_build_object(
    'done',
    exists (select 1 from public.profiles where role = 'admin')
  )
)
on conflict (key) do nothing;

-- Dipanggil anon/login page: apakah wizard setup perlu ditampilkan?
create or replace function public.check_setup_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'needs_setup',
    not coalesce(
      (select (value ->> 'done')::boolean
       from public.system_settings where key = 'setup_completed'),
      false
    )
  )
$$;

-- Menjalankan setup pertama: buat akun admin + simpan profil sekolah.
-- HANYA berhasil selama setup belum selesai (guard paling atas).
create or replace function public.bootstrap_setup(
  p_username      text,
  p_password      text,
  p_full_name     text,
  p_app_name      text    default null,
  p_school_name   text    default null,
  p_logo_url      text    default null,
  p_city          text    default null,
  p_address       text    default null,
  p_headmaster    text    default null,
  p_academic_year text    default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_uid   uuid;
  v_mail  text;
  v_done  boolean;
  v_ident jsonb;
  v_sub   text;
begin
  -- ---------- GUARD: sekali pakai ----------
  select coalesce((value ->> 'done')::boolean, false)
    into v_done
  from public.system_settings
  where key = 'setup_completed';

  if coalesce(v_done, false) then
    raise exception 'Setup telah selesai sebelumnya. Silakan login dengan akun Anda.';
  end if;

  -- ---------- Validasi ----------
  p_username := lower(trim(coalesce(p_username, '')));
  if p_username !~ '^[a-z0-9._-]{3,30}$' then
    raise exception 'Username harus 3-30 karakter: huruf kecil, angka, titik, garis bawah atau strip.';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'Password minimal 8 karakter.';
  end if;
  if length(coalesce(trim(coalesce(p_full_name, '')))) < 2 then
    raise exception 'Nama lengkap admin wajib diisi.';
  end if;
  if exists (select 1 from public.profiles where username = p_username) then
    raise exception 'Username "%" sudah digunakan.', p_username;
  end if;

  -- ---------- Buat user Supabase Auth ----------
  v_uid  := gen_random_uuid();
  v_mail := p_username || '@cbt.local';

  insert into auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    recovery_sent_at, last_sign_in_at
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_uid, 'authenticated', 'authenticated', v_mail,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('username', p_username, 'full_name', trim(p_full_name), 'role', 'admin'),
    now(), now(),
    '', '', '', '',
    null, null
  );

  -- ---------- Buat baris identities (best-effort, adaptif skema apa pun) ----------
  -- Baris ini bersifat pelengkap; login email+password tetap berfungsi tanpa itu,
  -- sehingga kegagalan di sini TIDAK boleh menggagalkan setup.
  v_sub   := v_uid::text;
  v_ident := jsonb_build_object('sub', v_sub, 'email', v_mail, 'email_verified', true);

  begin
    declare
      v_has_id     boolean;
      v_id_is_uuid boolean;
    begin
      select count(*) filter (where column_name = 'id') > 0,
             count(*) filter (where column_name = 'id' and udt_name = 'uuid') > 0
        into v_has_id, v_id_is_uuid
      from information_schema.columns
      where table_schema = 'auth'
        and table_name   = 'identities'
        and column_name in ('id','user_id','provider_id','identity_data',
                            'provider','last_sign_in_at','created_at','updated_at');

      if v_has_id then
        execute format(
          'insert into auth.identities
             (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
           values (%s, $1, $2, $3, ''email'', now(), now(), now())',
          case when v_id_is_uuid then 'gen_random_uuid()' else 'gen_random_uuid()::text' end
        ) using v_uid, v_sub, v_ident;
      else
        execute format(
          'insert into auth.identities
             (user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
           values ($1, $2, $3, ''email'', now(), now(), now())'
        ) using v_uid, v_sub, v_ident;
      end if;
    end;
  exception when others then
    -- Skema auth berbeda dari perkiraan → lewati; login tetap normal.
    raise notice 'identities insert dilewati: %', sqlerrm;
  end;

  -- Profil admin dibuat otomatis oleh trigger on_auth_user_created.

  -- ---------- Simpan profil sekolah ----------
  update public.school_settings set
    app_name       = coalesce(nullif(trim(coalesce(p_app_name, '')), ''), app_name),
    school_name    = coalesce(nullif(trim(coalesce(p_school_name, '')), ''), school_name),
    logo_url       = nullif(trim(coalesce(p_logo_url, '')), ''),
    city           = nullif(trim(coalesce(p_city, '')), ''),
    address        = nullif(trim(coalesce(p_address, '')), ''),
    headmaster     = nullif(trim(coalesce(p_headmaster, '')), ''),
    academic_year  = nullif(trim(coalesce(p_academic_year, '')), '')
  where id = true;

  -- ---------- Kunci setup selamanya ----------
  insert into public.system_settings (key, value)
  values ('setup_completed', '{"done": true}')
  on conflict (key) do update set value = '{"done": true}', updated_at = now();

  perform public.log_audit('SETUP_COMPLETED', 'school_settings', v_uid::text,
                           jsonb_build_object('username', p_username));

  return jsonb_build_object('ok', true, 'username', p_username);
end $$;

-- ------------------------------------------------------------
-- SUMBER: 00008_remove_demo_data.sql
-- ------------------------------------------------------------
-- ============================================================
-- SMK AL-FATA CBT — Migration 00008: Hapus Data Demo/Dummy
-- Membersihkan seed contoh dari migrasi lama (mapel, kelas, jurusan).
--
-- AMAN: baris hanya dihapus bila BENAR-BENAR masih kosong.
-- Jika Anda sudah memakai salah satu data itu untuk data nyata
-- (sudah ada soal/ujian/siswa yang menautkannya), baris tersebut
-- TIDAK akan dihapus.
-- ============================================================

-- Mata pelajaran contoh: hapus hanya jika belum dipakai bank soal / ujian / guru
delete from public.subjects s
where s.code in ('MTK', 'BIND', 'BING', 'INF', 'PABP', 'PPKN')
  and not exists (select 1 from public.question_banks b where b.subject_id = s.id)
  and not exists (select 1 from public.exams e where e.subject_id = s.id)
  and not exists (select 1 from public.teacher_subjects ts where ts.subject_id = s.id);

-- Kelas contoh: hapus hanya jika belum berisi siswa
delete from public.classes c
where c.name in ('X TJKT 1', 'XI TJKT 1', 'XII TJKT 1')
  and not exists (select 1 from public.students st where st.class_id = c.id);

-- Jurusan contoh: hapus hanya jika tidak lagi memiliki kelas / target ujian
delete from public.departments d
where d.code = 'TJKT'
  and not exists (select 1 from public.classes c where c.department_id = d.id)
  and not exists (
    select 1 from public.exam_targets t
    where t.kind = 'department' and t.target_id = d.id
  );

-- ------------------------------------------------------------
-- SUMBER: 00009_flexible_levels.sql
-- ------------------------------------------------------------
-- ============================================================
-- SMK AL-FATA CBT — Migration 00009: Tingkat Kelas Fleksibel
-- Mengizinkan level 1–13 (sebelumnya terkunci 10–13) agar cocok
-- dengan penamaan tingkat mana pun yang dipakai sekolah.
--
-- CATATAN: grade_level berada pada tabel question_banks.
-- File ini idempotent — aman dijalankan ulang.
-- ============================================================

-- ---------- classes.level ----------
alter table public.classes
  drop constraint if exists classes_level_check;

do $$ begin
  alter table public.classes
    add constraint classes_level_check check (level between 1 and 13);
exception when others then
  if sqlerrm like '%already exists%' then null; else raise; end if;
end $$;

-- ---------- question_banks.grade_level ----------
alter table public.question_banks
  drop constraint if exists question_banks_grade_level_check;

do $$ begin
  alter table public.question_banks
    add constraint question_banks_grade_level_check
    check (grade_level is null or grade_level between 1 and 13);
exception when others then
  if sqlerrm like '%already exists%' then null; else raise; end if;
end $$;

-- ------------------------------------------------------------
-- SUMBER: 00010_fix_critical.sql
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- SUMBER: 00011_admin_create_user.sql
-- ------------------------------------------------------------
-- ============================================================
-- SMK AL-FATA CBT — Migration 00011: Admin create user fallback
-- Fallback tanpa Edge Function: admin dapat membuat akun siswa/guru
-- langsung via RPC security definer. Edge tetap utama jika tersedia.
-- ============================================================

create or replace function public.admin_create_user(
  p_username  text,
  p_password  text,
  p_full_name text,
  p_role      public.user_role,
  p_student   jsonb default null,
  p_teacher   jsonb default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, auth
as $$
declare
  v_is_admin boolean;
  v_uid      uuid;
  v_mail     text;
  v_uname    text;
  v_sub      text;
  v_ident    jsonb;
  v_prof_id  uuid;
  v_teacher_id uuid;
begin
  select private.is_admin() into v_is_admin;
  if not coalesce(v_is_admin, false) then
    raise exception 'Hanya admin yang diizinkan membuat akun.';
  end if;

  v_uname := lower(trim(coalesce(p_username, '')));
  if v_uname !~ '^[a-z0-9._-]{3,30}$' then
    raise exception 'Username hanya boleh huruf, angka, titik, garis bawah/strip (3-30 karakter).';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'Password minimal 8 karakter.';
  end if;
  if length(trim(coalesce(p_full_name, ''))) < 2 then
    raise exception 'Nama lengkap wajib diisi (min. 2 karakter).';
  end if;
  if p_role not in ('admin','teacher','student') then
    raise exception 'Role tidak valid.';
  end if;

  if exists (select 1 from public.profiles where username ilike v_uname) then
    raise exception 'Username "%" sudah digunakan.', v_uname;
  end if;

  v_uid  := gen_random_uuid();
  v_mail := v_uname || '@cbt.local';

  if exists (select 1 from auth.users where email = v_mail) then
    raise exception 'Email "%" sudah terdaftar.', v_mail;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    recovery_sent_at, last_sign_in_at
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_uid, 'authenticated', 'authenticated', v_mail,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('username', v_uname, 'full_name', trim(p_full_name), 'role', p_role::text),
    now(), now(),
    '', '', '', '',
    null, null
  );

  v_sub   := v_uid::text;
  v_ident := jsonb_build_object('sub', v_sub, 'email', v_mail, 'email_verified', true);
  begin
    declare
      v_has_id     boolean;
      v_id_is_uuid boolean;
    begin
      select count(*) filter (where column_name = 'id') > 0,
             count(*) filter (where column_name = 'id' and udt_name = 'uuid') > 0
        into v_has_id, v_id_is_uuid
      from information_schema.columns
      where table_schema = 'auth'
        and table_name   = 'identities'
        and column_name in ('id','user_id','provider_id','identity_data','provider','last_sign_in_at','created_at','updated_at');
      if v_has_id then
        execute format(
          'insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at) values (%s, $1, $2, $3, ''email'', now(), now(), now())',
          case when v_id_is_uuid then 'gen_random_uuid()' else 'gen_random_uuid()::text' end
        ) using v_uid, v_sub, v_ident;
      else
        execute format(
          'insert into auth.identities (user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at) values ($1, $2, $3, ''email'', now(), now(), now())'
        ) using v_uid, v_sub, v_ident;
      end if;
    end;
  exception when others then
    raise notice 'identities insert dilewati: %', sqlerrm;
  end;

  -- profiles dibuat otomatis via trigger handle_new_user, tapi pastikan field sinkron
  perform pg_sleep(0.01);
  select id into v_prof_id from public.profiles where id = v_uid;
  if v_prof_id is null then
    -- fallback jika trigger belum jalan (race), buat manual
    insert into public.profiles (id, username, full_name, role, is_active)
    values (v_uid, v_uname, trim(p_full_name), p_role, true)
    on conflict (id) do update set username = excluded.username, full_name = excluded.full_name, role = excluded.role;
  else
    update public.profiles
      set username = v_uname, full_name = trim(p_full_name), role = p_role
      where id = v_uid;
  end if;

  if p_role = 'student' then
    insert into public.students (profile_id, nis, nisn, gender, birth_place, birth_date, address, phone, email, class_id)
    values (
      v_uid,
      nullif(trim(coalesce(p_student->>'nis','')), ''),
      nullif(trim(coalesce(p_student->>'nisn','')), ''),
      nullif(p_student->>'gender','')::public.gender_type,
      nullif(trim(coalesce(p_student->>'birth_place','')), ''),
      nullif(trim(coalesce(p_student->>'birth_date','')), '')::date,
      nullif(trim(coalesce(p_student->>'address','')), ''),
      nullif(trim(coalesce(p_student->>'phone','')), ''),
      nullif(trim(coalesce(p_student->>'email','')), ''),
      nullif(trim(coalesce(p_student->>'class_id','')), '')::uuid
    );
  elsif p_role = 'teacher' then
    insert into public.teachers (profile_id, nip, phone, email, address)
    values (
      v_uid,
      nullif(trim(coalesce(p_teacher->>'nip','')), ''),
      nullif(trim(coalesce(p_teacher->>'phone','')), ''),
      nullif(trim(coalesce(p_teacher->>'email','')), ''),
      nullif(trim(coalesce(p_teacher->>'address','')), '')
    )
    returning id into v_teacher_id;
    if coalesce(p_teacher->'subject_ids','[]'::jsonb) != '[]'::jsonb then
      insert into public.teacher_subjects (teacher_id, subject_id)
      select v_teacher_id, (value #>> '{}')::uuid
      from jsonb_array_elements_text(p_teacher->'subject_ids') with ordinality
      on conflict do nothing;
    end if;
  end if;

  perform public.log_audit('CREATE_USER', 'profile', v_uid::text,
    jsonb_build_object('role', p_role, 'username', v_uname, 'via', 'rpc_fallback'));

  return jsonb_build_object('ok', true, 'user_id', v_uid, 'email', v_mail);
end
$$;

revoke all on function public.admin_create_user(text,text,text,public.user_role,jsonb,jsonb) from public;
grant execute on function public.admin_create_user(text,text,text,public.user_role,jsonb,jsonb) to authenticated;

comment on function public.admin_create_user is 'Fallback RPC untuk pembuatan akun tanpa Edge Function manage-user';

-- ------------------------------------------------------------
-- SUMBER: 00012_admin_delete_user.sql
-- ------------------------------------------------------------
-- ============================================================
-- SMK AL-FATA CBT — Migration 00012: Admin delete user fallback
-- Fallback tanpa Edge Function: admin dapat menghapus akun
-- langsung via RPC security definer. Edge tetap utama jika tersedia.
-- ============================================================

create or replace function public.admin_delete_user(
  p_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, auth
as $$
declare
  v_is_admin boolean;
  v_exists   boolean;
begin
  select private.is_admin() into v_is_admin;
  if not coalesce(v_is_admin, false) then
    raise exception 'Hanya admin yang diizinkan menghapus akun.';
  end if;

  if p_user_id is null then
    raise exception 'user_id wajib diisi.';
  end if;

  -- prevent self-deletion
  if p_user_id = auth.uid() then
    raise exception 'Tidak dapat menghapus akun sendiri.';
  end if;

  select exists(select 1 from auth.users where id = p_user_id) into v_exists;
  if not v_exists then
    -- auth user sudah tidak ada, bersihkan profile & student jika masih ada
    delete from public.students where profile_id = p_user_id;
    delete from public.profiles where id = p_user_id;
    return jsonb_build_object('ok', true, 'message', 'Auth user tidak ditemukan, profile & student sudah dibersihkan.');
  end if;

  -- delete auth.users (will cascade to profiles via FK, and profiles cascade to students)
  delete from auth.users where id = p_user_id;

  perform public.log_audit('DELETE_USER', 'profile', p_user_id::text,
    jsonb_build_object('via', 'rpc_fallback'));

  return jsonb_build_object('ok', true, 'user_id', p_user_id);
end
$$;

revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated;

comment on function public.admin_delete_user is 'Fallback RPC untuk menghapus akun tanpa Edge Function manage-user';

-- ------------------------------------------------------------
-- SUMBER: 00013_schedules.sql
-- ------------------------------------------------------------
-- ============================================================
-- SMK AL-FATA CBT — Migration 00013: Jadwal / Schedules
-- Tabel jadwal untuk siswa, guru, dan admin
-- ============================================================

create table if not exists public.schedules (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  subject_id  uuid references public.subjects(id) on delete set null,
  teacher_id  uuid references public.teachers(id) on delete set null,
  class_id    uuid references public.classes(id) on delete set null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time  time not null,
  end_time    time not null,
  start_date  date,
  end_date    date,
  color       text default '#3b82f6',
  is_active   boolean not null default true,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.schedules enable row level security;

drop policy if exists "schedules_select_all" on public.schedules;
create policy "schedules_select_all" on public.schedules
  for select to authenticated using (true);

drop policy if exists "schedules_insert_admin" on public.schedules;
create policy "schedules_insert_admin" on public.schedules
  for insert to authenticated
  with check (private.is_admin());

drop policy if exists "schedules_update_admin" on public.schedules;
create policy "schedules_update_admin" on public.schedules
  for update to authenticated
  using (private.is_admin());

drop policy if exists "schedules_delete_admin" on public.schedules;
create policy "schedules_delete_admin" on public.schedules
  for delete to authenticated
  using (private.is_admin());

create index if not exists idx_schedules_class on public.schedules (class_id);
create index if not exists idx_schedules_teacher on public.schedules (teacher_id);
create index if not exists idx_schedules_day on public.schedules (day_of_week);

create or replace trigger schedules_updated_at
  before update on public.schedules
  for each row execute function public.set_updated_at();

comment on table public.schedules is 'Jadwal pelajaran / kegiatan untuk siswa dan guru';

-- ------------------------------------------------------------
-- SUMBER: 00014_branding_palette.sql
-- ------------------------------------------------------------
-- 00009: Branding palette gradasi — dukung >2 warna
alter table public.school_settings
  add column if not exists extra_colors jsonb not null default '[]'::jsonb;

comment on column public.school_settings.extra_colors is 'Warna tambahan untuk tema gradasi (array hex, dipakai bila >1 warna)';

update public.school_settings set extra_colors = '[]'::jsonb where extra_colors is null;

-- ------------------------------------------------------------
-- SUMBER: 00015_fix_exam_visibility.sql
-- ------------------------------------------------------------
-- ============================================================
-- SMK AL-FATA CBT — Migration 00015: Perbaiki visibilitas ujian
-- Masalah: ujian sudah aktif (published) tapi tidak muncul di siswa
-- Penyebab:
--  1) exam_allows_student tidak cek is_active & gagal jika class_id null
--  2) student_available_exams menampilkan ujian tanpa soal (start_attempt akan gagal)
--  3) publish tanpa validasi soal/peserta
--  4) sync_participants tidak filter is_active & tidak handle kelas null
-- ============================================================

-- ---------- 1) Perbaiki exam_allows_student: handle null class & is_active ----------
create or replace function private.exam_allows_student(p_exam_id uuid, p_student_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select
    -- tidak dikecualikan
    not exists (
      select 1 from public.exam_participants ep
      where ep.exam_id = p_exam_id and ep.student_id = p_student_id and ep.is_removed
    )
    -- dan terdaftar via participants langsung ATAU via target kelas/jurusan
    and (
      exists (
        select 1 from public.exam_participants ep
        where ep.exam_id = p_exam_id and ep.student_id = p_student_id and not ep.is_removed
      )
      or exists (
        select 1
        from public.exam_targets t
        join public.students s on s.id = p_student_id
        left join public.classes c on c.id = s.class_id
        where t.exam_id = p_exam_id
          and s.is_active
          and (
            (t.kind = 'class' and t.target_id = c.id)
            or (t.kind = 'department' and t.target_id = c.department_id)
          )
      )
    )
$$;

-- ---------- 2) Perbaiki sync_exam_participants: filter is_active & handle null class ----------
create or replace function public.sync_exam_participants(p_exam_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  -- Hanya siswa aktif yang akan ditambahkan
  insert into public.exam_participants (exam_id, student_id, added_by)
  select p_exam_id, s.id, null
  from public.students s
  left join public.classes c on c.id = s.class_id
  where s.is_active
    and exists (
      select 1 from public.exam_targets t
      where t.exam_id = p_exam_id
        and ((t.kind = 'class' and t.target_id = c.id)
          or (t.kind = 'department' and t.target_id = c.department_id))
    )
  on conflict (exam_id, student_id) do update set is_removed = false;

  -- Bersihkan peserta yang sudah tidak match target lagi (tandai is_removed)
  -- Hanya untuk peserta yang ditambahkan otomatis (added_by is null), jangan sentuh manual
  update public.exam_participants ep
  set is_removed = true
  where ep.exam_id = p_exam_id
    and ep.added_by is null
    and not ep.is_removed
    and not private.exam_allows_student(p_exam_id, ep.student_id)
    and exists (select 1 from public.exam_targets t where t.exam_id = p_exam_id);
end $$;

-- ---------- 3) Perbaiki student_available_exams: filter soal & is_active ----------
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
  v_has_q bool;
begin
  select id into v_sid from public.students where profile_id = v_uid and is_active;
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

    -- Filter: ujian tanpa soal jangan tampilkan (akan gagal start_attempt)
    select count(*) into v_qtot from public.exam_questions eq where eq.exam_id = rec.id;
    continue when v_qtot = 0;

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
      'show_result_to_student', rec.show_result_to_student,
      'status_for_me', v_state,
      'active_attempt_id', v_active,
      'best_score', v_best
    );
  end loop;

  return v_res;
end $$;

-- ---------- 4) Helper: cek apakah ujian siap dipublish ----------
create or replace function public.exam_publish_readiness(p_exam_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'has_questions', (select count(*) > 0 from public.exam_questions where exam_id = p_exam_id),
    'has_targets', (select count(*) > 0 from public.exam_targets where exam_id = p_exam_id),
    'has_participants', (select count(*) > 0 from public.exam_participants where exam_id = p_exam_id and not is_removed),
    'question_count', (select count(*) from public.exam_questions where exam_id = p_exam_id),
    'participant_count', (select count(*) from public.exam_participants where exam_id = p_exam_id and not is_removed)
  )
$$;

-- ---------- 5) Trigger: auto-sync saat status jadi published ----------
create or replace function private.trg_exam_publish_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    perform public.sync_exam_participants(new.id);
  end if;
  return new;
end $$;

drop trigger if exists trg_exam_publish_sync on public.exams;
create trigger trg_exam_publish_sync
  after update of status on public.exams
  for each row execute function private.trg_exam_publish_sync();

-- ---------- 6) Perbaiki trigger student sync: handle insert tanpa class_id check ----------
drop trigger if exists trg_students_resync on public.students;
create trigger trg_students_resync
  after insert or update of class_id, is_active on public.students
  for each row execute procedure public.trg_student_class_changed();

-- Update trg_student_class_changed untuk handle is_active & re-sync removal juga
create or replace function public.trg_student_class_changed()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_exam uuid;
begin
  if tg_op = 'UPDATE' and new.class_id is not distinct from old.class_id and new.is_active is not distinct from old.is_active then
    return null;
  end if;

  -- Jika siswa non-aktif, tandai removed dari semua ujian yang dia ikuti via target
  if not new.is_active then
    update public.exam_participants set is_removed = true
    where student_id = new.id and added_by is null;
    return null;
  end if;

  for v_exam in
    select distinct t.exam_id
    from public.exam_targets t
    join public.classes c on c.id = new.class_id
    join public.exams e on e.id = t.exam_id
    where ((t.kind = 'class' and t.target_id = c.id)
        or (t.kind = 'department' and t.target_id = c.department_id))
      and e.status in ('draft', 'published')
  loop
    perform public.sync_exam_participants(v_exam);
  end loop;
  return null;
end $$;

-- ---------- 7) Backfill: sinkronkan semua ujian published yang belum punya participants ----------
do $$
declare
  r record;
begin
  for r in select id from public.exams where status = 'published' loop
    perform public.sync_exam_participants(r.id);
  end loop;
end $$;

-- ---------- 8) Grants ----------
grant execute on function private.exam_allows_student(uuid, uuid) to authenticated;
grant execute on function public.sync_exam_participants(uuid) to authenticated;
grant execute on function public.student_available_exams() to authenticated;
grant execute on function public.exam_publish_readiness(uuid) to authenticated;
grant execute on function public.trg_student_class_changed() to authenticated;

-- ------------------------------------------------------------
-- SUMBER: 00016_branding_defaults.sql
-- ------------------------------------------------------------
-- ============================================================
-- SMK AL-FATA CBT — Migration 00016: Branding defaults update
-- Ganti warna default #2563eb -> #0D868F (teal)
-- Set logo default ke vcbt-01.png & vcbt-02.png
-- Hapus jejak logo lama (logo.svg / favicon.svg) tidak ada di DB,
-- hanya update baris school_settings jika masih default lama.
-- ============================================================

-- Update default value kolom primary_color & secondary_color (gradasi #0D868F → #0CBCC9)
alter table public.school_settings
  alter column primary_color set default '#0D868F';

alter table public.school_settings
  alter column secondary_color set default '#0CBCC9';

-- Update baris yang sudah ada jika masih pakai default lama — FIX: gunakan /logo.webp yang memang ada di public/
update public.school_settings
set
  primary_color = '#0D868F',
  secondary_color = '#0CBCC9',
  logo_url = coalesce(
    nullif(logo_url, ''),
    case when logo_url like '%logo.svg' or logo_url like '%favicon.svg' then null else logo_url end,
    '/logo.webp'
  ),
  favicon_url = coalesce(
    nullif(favicon_url, ''),
    case when favicon_url like '%logo.svg' or favicon_url like '%favicon.svg' then null else favicon_url end,
    '/logo.webp'
  ),
  updated_at = now()
where id = true
  and (
    primary_color in ('#2563eb', '#3b82f6', '#0D868F')
    or secondary_color in ('#0ea5e9', '#0D868F', '#2563eb')
    or logo_url like '%logo.svg' or logo_url like '%favicon.svg' or logo_url is null or logo_url like '%vcbt%'
    or favicon_url like '%logo.svg' or favicon_url like '%favicon.svg' or favicon_url is null or favicon_url like '%vcbt%'
  );

-- Jika baris belum ada (fresh install), sisipkan default baru — FIX: /logo.webp
insert into public.school_settings (id, app_name, school_name, logo_url, favicon_url, primary_color, secondary_color)
values (true, 'SMK AL-FATA CBT', 'SMK AL-FATA', '/logo.webp', '/logo.webp', '#0D868F', '#0CBCC9')
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- SUMBER: 00017_fix_student_visible_guaranteed.sql
-- ------------------------------------------------------------
-- ============================================================
-- SMK AL-FATA CBT — Migration 00017: Jaminan ujian tampil 100%
-- Penyebab "Belum ada ujian" masih muncul setelah 00015:
--  1) exam_allows_student return false jika exam tanpa target/peserta → fallback jadi visible ke semua siswa aktif
--  2) student_available_exams filter v_qtot=0 menyembunyikan ujian → ubah jadi tetap tampil (tapi start_attempt tetap blok)
--     agar diagnosa lebih mudah, admin langsung tau ujian ada tapi 0 soal
--  3) Window 2 hari setelah ends_at terlalu sempit untuk debug → perlebar jadi 30 hari
--  4) Pastikan grants & trigger sinkron tetap idempotent
--  5) Helper debug: student_available_exams_debug() untuk cek kenapa ujian tidak muncul
-- ============================================================

-- ---------- 1) exam_allows_student: fallback visible ke semua jika tanpa target/peserta ----------
create or replace function private.exam_allows_student(p_exam_id uuid, p_student_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select
    not exists (
      select 1 from public.exam_participants ep
      where ep.exam_id = p_exam_id and ep.student_id = p_student_id and ep.is_removed
    )
    and (
      -- langsung terdaftar
      exists (
        select 1 from public.exam_participants ep
        where ep.exam_id = p_exam_id and ep.student_id = p_student_id and not ep.is_removed
      )
      -- via target kelas/jurusan
      or exists (
        select 1
        from public.exam_targets t
        join public.students s on s.id = p_student_id
        left join public.classes c on c.id = s.class_id
        where t.exam_id = p_exam_id
          and s.is_active
          and (
            (t.kind = 'class' and t.target_id = c.id)
            or (t.kind = 'department' and t.target_id = c.department_id)
          )
      )
      -- FALLBACK: jika ujian tidak punya target & tidak punya peserta aktif sama sekali → anggap untuk semua siswa aktif
      -- Ini mencegah kasus admin "Tetap Aktifkan" tanpa target lalu tidak ada yang melihat
      or (
        not exists (select 1 from public.exam_targets t where t.exam_id = p_exam_id)
        and not exists (select 1 from public.exam_participants ep where ep.exam_id = p_exam_id and not ep.is_removed)
        and exists (select 1 from public.students s where s.id = p_student_id and s.is_active)
      )
    )
$$;

-- ---------- 2) student_available_exams: jangan filter 0 soal, perlebar window, tetap visible ----------
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
  select id into v_sid from public.students where profile_id = v_uid and is_active;
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
      and e.ends_at > now() - interval '30 days'
      and e.starts_at < now() + interval '60 days'
  loop
    continue when not private.exam_allows_student(rec.id, v_sid);

    select count(*) into v_qtot from public.exam_questions eq where eq.exam_id = rec.id;
    -- JANGAN sembunyikan ujian 0 soal; biarkan tampil agar admin & siswa tau ada masalah (total_questions=0)
    -- start_attempt tetap akan blok dengan pesan "Ujian belum memiliki soal."

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

    if v_active is not null then
      v_state := 'resume';
    elsif now() < rec.starts_at then
      v_state := 'upcoming';
    elsif now() > rec.ends_at then
      v_state := 'closed';
    elsif v_qtot = 0 then
      -- tetap tampil tapi tidak bisa dikerjakan
      v_state := 'no_attempts';
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
      'show_result_to_student', rec.show_result_to_student,
      'status_for_me', v_state,
      'active_attempt_id', v_active,
      'best_score', v_best
    );
  end loop;

  return v_res;
end $$;

-- ---------- 3) Debug helper: kenapa ujian tidak muncul untuk siswa login ----------
create or replace function public.student_available_exams_debug()
returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
declare
  v_uid uuid := auth.uid();
  v_sid uuid;
  v_sclass uuid;
  v_sdept uuid;
  v_res jsonb := '[]'::jsonb;
  rec record;
  v_allows boolean;
  v_qtot int;
  v_is_active boolean;
begin
  select s.id, s.class_id, c.department_id, s.is_active
    into v_sid, v_sclass, v_sdept, v_is_active
  from public.students s
  left join public.classes c on c.id = s.class_id
  where s.profile_id = v_uid;
  if v_sid is null then
    return jsonb_build_object('error','profil siswa tidak ditemukan atau tidak aktif','profile_id',v_uid);
  end if;
  for rec in select e.id, e.title, e.status, e.starts_at, e.ends_at from public.exams e where e.status='published' order by e.starts_at desc limit 20 loop
    select private.exam_allows_student(rec.id, v_sid) into v_allows;
    select count(*) into v_qtot from public.exam_questions where exam_id=rec.id;
    v_res := v_res || jsonb_build_object(
      'exam_id', rec.id,
      'title', rec.title,
      'status', rec.status,
      'starts_at', rec.starts_at,
      'ends_at', rec.ends_at,
      'qtot', v_qtot,
      'allows', v_allows,
      'student_class', v_sclass,
      'student_dept', v_sdept,
      'student_active', v_is_active,
      'targets', (select jsonb_agg(jsonb_build_object('kind',kind,'target_id',target_id)) from public.exam_targets where exam_id=rec.id),
      'is_participant', exists(select 1 from public.exam_participants where exam_id=rec.id and student_id=v_sid and not is_removed),
      'is_removed', exists(select 1 from public.exam_participants where exam_id=rec.id and student_id=v_sid and is_removed)
    );
  end loop;
  return jsonb_build_object('student_id',v_sid,'class_id',v_sclass,'dept_id',v_sdept,'exams',v_res);
end $$;

-- ---------- 4) Grants ----------
grant execute on function private.exam_allows_student(uuid, uuid) to authenticated;
grant execute on function public.student_available_exams() to authenticated;
grant execute on function public.student_available_exams_debug() to authenticated;
grant execute on function public.sync_exam_participants(uuid) to authenticated;
grant execute on function public.exam_publish_readiness(uuid) to authenticated;

-- ---------- 5) Backfill lagi ----------
do $$
declare r record;
begin
  for r in select id from public.exams where status='published' loop
    perform public.sync_exam_participants(r.id);
  end loop;
end $$;

-- ------------------------------------------------------------
-- SUMBER: 00018_fix_logo_missing.sql
-- ------------------------------------------------------------
-- ============================================================
-- SMK AL-FATA CBT — Migration 00018: Perbaiki logo hilang
-- Penyebab: 00016 set logo_url='/vcbt-01.png' & favicon='/vcbt-02.png'
-- tetapi file tidak ada di public/ (hanya logo.webp) → 404 broken image
-- + fallback BASE_URL tidak konsisten (/ vs /logo.webp vs /ujian/logo.webp)
-- Fix: kembalikan ke /logo.webp yang memang ada, bersihkan cache lama
-- ============================================================

-- Pastikan default kolom tetap teal tapi logo kembali ke yang ada
alter table public.school_settings
  alter column primary_color set default '#0D868F';
alter table public.school_settings
  alter column secondary_color set default '#0CBCC9';

-- Perbaiki baris yang sudah terlanjur jadi /vcbt-01.png / /vcbt-02.png / /vcbt* / kosong
update public.school_settings
set
  logo_url = '/logo.webp',
  favicon_url = '/logo.webp',
  updated_at = now()
where id = true
  and (
    logo_url in ('/vcbt-01.png','/vcbt-02.png','/vcbt-01.png ','/logo.svg','/favicon.svg')
    or favicon_url in ('/vcbt-01.png','/vcbt-02.png','/vcbt-01.png ','/logo.svg','/favicon.svg')
    or logo_url like '%vcbt%' or favicon_url like '%vcbt%'
    or logo_url like '%logo.svg%' or favicon_url like '%favicon.svg%'
    or logo_url is null or favicon_url is null
    or logo_url = '' or favicon_url = ''
  );

-- Fallback generik: jika masih ada yang tidak diawali http/https/data: dan bukan /logo.webp, normalisasi ke /logo.webp
-- (misal: vcbt-01.png tanpa slash, ujian/logo.webp salah path)
update public.school_settings
set
  logo_url = case
    when logo_url ~ '^https?://' then logo_url
    when logo_url ~ '^data:' then logo_url
    when logo_url = '/logo.webp' then logo_url
    else '/logo.webp'
  end,
  favicon_url = case
    when favicon_url ~ '^https?://' then favicon_url
    when favicon_url ~ '^data:' then favicon_url
    when favicon_url = '/logo.webp' then favicon_url
    else '/logo.webp'
  end,
  updated_at = now()
where id = true
  and (logo_url <> '/logo.webp' or favicon_url <> '/logo.webp')
  and (logo_url not like 'http%' and logo_url not like 'data:%' or logo_url like '%vcbt%')
;

-- Jika baris belum ada (fresh install yang belum sempat dibuat 00016), buat dengan logo benar
insert into public.school_settings (id, app_name, school_name, logo_url, favicon_url, primary_color, secondary_color)
values (true, 'SMK AL-FATA CBT', 'SMK AL-FATA', '/logo.webp', '/logo.webp', '#0D868F', '#0CBCC9')
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- SUMBER: 00019_fix_get_attempt_payload_alias.sql
-- ------------------------------------------------------------
-- ============================================================
-- SMK AL-FATA CBT — Migration 00019: Fix get_attempt_payload alias bug
-- Error: missing FROM-clause entry for table "s"
-- Penyebab: 00002_functions.sql:433 select s.nis ... from students st
--           alias tabel adalah "st" tapi select pakai "s.nis"
-- Dampak: halaman ujian (ExamRunner) gagal load dengan "Terjadi Kendala"
--         saat memanggil public.get_attempt_payload()
-- Fix: ganti s.nis -> st.nis (alias yang benar)
-- ============================================================

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

-- ------------------------------------------------------------
-- SUMBER: 00020_fix_camera_snapshot_upload.sql
-- ------------------------------------------------------------
-- Fix: Siswa harus bisa upload snapshot kamera untuk monitoring admin
-- Bucket media public, tapi policy lama hanya mengizinkan admin/teacher insert.
-- Tanpa ini, SilentCameraCapture di ExamRunnerPage gagal upload dan LiveCameraWall di admin gelap/kosong.

drop policy if exists "media_insert_staff" on storage.objects;
create policy "media_insert_staff" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and private.my_role() in ('admin', 'teacher')
  );

drop policy if exists "media_insert_snapshot_student" on storage.objects;
create policy "media_insert_snapshot_student" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and private.my_role() = 'student'
    and name like 'exam-snapshot/%'
  );

-- Pastikan select tetap public (sudah ada media_public_read)
-- media_files sudah mengizinkan insert own (owner_id = auth.uid()), jadi siswa bisa insert baris media_files

-- ------------------------------------------------------------
-- SUMBER: 00021_fix_avatar_storage.sql
-- ------------------------------------------------------------
-- ============================================================
-- SMK AL-FATA CBT — Migration 00021: Fix avatar upload ke Storage
-- Semua upload file (avatar, logo, soal media, snapshot) wajib via
-- Supabase Storage bucket 'media' agar tidak membebani aplikasi.
-- Policy sebelumnya hanya izinkan admin/teacher insert, sehingga
-- siswa gagal upload foto profil (avatars/).
-- ============================================================

-- Izinkan semua user ter-login upload ke folder avatars/
drop policy if exists "media_insert_avatar" on storage.objects;
create policy "media_insert_avatar" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'avatars'
  );

-- Izinkan semua user ter-login upload ke folder logo/ (admin saja yang bisa lewat UI, tapi policy longgar tidak masalah)
drop policy if exists "media_insert_logo" on storage.objects;
create policy "media_insert_logo" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'logo'
  );

-- Pastikan snapshot siswa tetap bisa (sudah ada di 00020, tapi re-apply agar idempotent)
drop policy if exists "media_insert_snapshot_student" on storage.objects;
create policy "media_insert_snapshot_student" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and private.my_role() = 'student'
    and name like 'exam-snapshot/%'
  );

-- Staff tetap bisa upload ke semua folder question-* dan umum
drop policy if exists "media_insert_staff" on storage.objects;
create policy "media_insert_staff" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and private.my_role() in ('admin', 'teacher')
  );

-- Public read tetap
drop policy if exists "media_public_read" on storage.objects;
create policy "media_public_read" on storage.objects for select
  using (bucket_id = 'media');

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
