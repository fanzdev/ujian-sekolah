-- ============================================================
-- SMK AL-FATA CBT — Migration 00001: Core Schema (IDEMPOTENT)
-- Aman dijalankan ulang: objek yang sudah ada akan dilewati.
-- ============================================================

create extension if not exists pgcrypto;
create extension if not exists citext;

create schema if not exists private;

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
