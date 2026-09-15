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
