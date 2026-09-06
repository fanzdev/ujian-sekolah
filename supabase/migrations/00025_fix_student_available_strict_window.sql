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
