-- ============================================================
-- SMK AL-FATA CBT - SETUP BAGIAN 01 (00001 s.d. 00008)
-- Isi: Skema, fungsi inti, trigger, RLS, storage, bootstrap admin
-- Cara pakai: jalankan file 01, 02, 03, 04 BERURUTAN di SQL Editor.
-- Setiap bagian diakhiri pesan konfirmasi BAGIAN_XX_SELESAI.
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

select 'BAGIAN_01_SELESAI' as status;