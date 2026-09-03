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
