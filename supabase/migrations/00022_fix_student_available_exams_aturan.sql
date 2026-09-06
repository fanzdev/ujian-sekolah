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
