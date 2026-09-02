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
