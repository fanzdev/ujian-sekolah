-- ============================================================
-- SMK AL-FATA CBT - SETUP BAGIAN 02 (00009 s.d. 00021)
-- Isi: Perbaikan fungsi ujian, akun, jadwal, branding, payload soal
-- Cara pakai: jalankan file 01, 02, 03, 04 BERURUTAN di SQL Editor.
-- Setiap bagian diakhiri pesan konfirmasi BAGIAN_XX_SELESAI.
-- Semua perintah idempotent, aman dijalankan ulang.
-- ============================================================

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

select 'BAGIAN_02_SELESAI' as status;