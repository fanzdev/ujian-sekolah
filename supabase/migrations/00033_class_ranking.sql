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
