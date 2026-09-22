-- Fix essay grading queue access for teachers
-- Teachers can only see essays from exams they own; admins see all.
create or replace function public.list_essay_queue(
  p_exam_id uuid default null,
  p_search text default null
)
returns table (
  answer_id uuid,
  attempt_id uuid,
  question_id uuid,
  status text,
  final_score numeric,
  final_feedback text,
  graded_by uuid,
  student_name text,
  student_nis text,
  question_text text,
  max_points numeric
)
language plpgsql security definer set search_path = public as $$
begin
  return query
  select
    a.id,
    a.attempt_id,
    a.question_id,
    coalesce(eg.status, 'pending'),
    eg.final_score,
    eg.final_feedback,
    eg.graded_by,
    p.full_name,
    s.nis,
    q.text,
    q.points
  from public.answers a
  join public.questions q on q.id = a.question_id
  join public.exam_attempts at on at.id = a.attempt_id
  join public.students s on s.id = at.student_id
  join public.profiles p on p.id = s.profile_id
  left join lateral (
    select status, final_score, final_feedback, graded_by
    from public.essay_grades eg2
    where eg2.attempt_id = a.attempt_id and eg2.question_id = a.question_id
    order by eg2.created_at desc
    limit 1
  ) eg on true
  where q.type = 'essay'
    and at.status in ('submitted', 'auto_submitted', 'graded')
    and (
      private.is_admin()
      or exists (
        select 1 from public.exams e
        where e.id = at.exam_id
          and (e.created_by = auth.uid() or e.teacher_id = private.my_teacher_id())
      )
    )
    and (p_exam_id is null or at.exam_id = p_exam_id)
    and (p_search is null or p.full_name ilike '%' || p_search || '%' or s.nis ilike '%' || p_search || '%')
  order by
    case coalesce(eg.status, 'pending') when 'pending' then 0 else 1 end,
    a.created_at desc
  limit 300
end;
$$;
