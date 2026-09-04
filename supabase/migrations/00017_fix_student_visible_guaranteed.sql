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
