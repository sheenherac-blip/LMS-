-- RPC functions (quiz delivery, grading, joining rooms)
create or replace function public.join_room(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare r rooms%rowtype;
begin
  if public.my_role() <> 'student' then raise exception 'Only students can join a room'; end if;
  select * into r from rooms where code = upper(trim(p_code));
  if not found then raise exception 'Room code not found'; end if;
  if r.status <> 'active' then raise exception 'This room is not active'; end if;
  insert into room_students(room_id, student_id) values (r.id, auth.uid()) on conflict do nothing;
  return r.id;
end $$;

create or replace function public.get_quiz_for_student(p_quiz uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare qz quizzes%rowtype; rm rooms%rowtype;
begin
  select * into qz from quizzes where id = p_quiz;
  if not found or qz.status <> 'published' then raise exception 'Quiz not available'; end if;
  if not public.is_room_member(qz.room_id) then raise exception 'You are not enrolled in this room'; end if;
  if exists(select 1 from attempts where quiz_id = p_quiz and student_id = auth.uid()) then
    raise exception 'You already took this quiz'; end if;
  if qz.due_date is not null and now() > qz.due_date then raise exception 'This quiz is past its due date'; end if;
  select * into rm from rooms where id = qz.room_id;
  return jsonb_build_object(
    'quiz', jsonb_build_object('id', qz.id, 'title', qz.title, 'description', qz.description,
              'time_limit_minutes', qz.time_limit_minutes, 'room_id', qz.room_id,
              'course_name', (select name from courses where id = rm.course_id)),
    'questions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', q.id, 'type', q.type, 'text', q.text, 'points', q.points,
        'options', case q.type
          when 'multiple_choice' then q.options
          when 'matching' then jsonb_build_object(
              'lefts',  (select jsonb_agg(p->>'left') from jsonb_array_elements(q.options) p),
              'rights', (select jsonb_agg(p->>'right' order by random()) from jsonb_array_elements(q.options) p))
          else null end) order by q.position), '[]'::jsonb)
      from questions q where q.quiz_id = qz.id));
end $$;

create or replace function public.submit_attempt(p_quiz uuid, p_answers jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare qz quizzes%rowtype; att uuid; r record; resp jsonb; earned numeric; ok boolean;
        tot numeric := 0; sc numeric := 0; n int; good int; pr jsonb; sname text;
begin
  select * into qz from quizzes where id = p_quiz;
  if not found or qz.status <> 'published' then raise exception 'Quiz not available'; end if;
  if not public.is_room_member(qz.room_id) then raise exception 'You are not enrolled in this room'; end if;
  if qz.due_date is not null and now() > qz.due_date + interval '2 minutes' then
    raise exception 'This quiz is past its due date'; end if;
  if exists(select 1 from attempts where quiz_id = p_quiz and student_id = auth.uid()) then
    raise exception 'You already took this quiz'; end if;

  insert into attempts(quiz_id, student_id) values (p_quiz, auth.uid()) returning id into att;

  for r in select * from questions where quiz_id = p_quiz order by position loop
    resp := p_answers -> r.id::text;
    earned := 0; ok := false;
    if resp is not null and resp <> 'null'::jsonb then
      if r.type = 'multiple_choice' then
        ok := (resp #>> '{}') = (r.answer #>> '{}');
      elsif r.type = 'true_false' then
        ok := lower(resp #>> '{}') = lower(r.answer #>> '{}');
      elsif r.type = 'identification' then
        ok := lower(trim(resp #>> '{}')) = any (
          select lower(trim(x)) from unnest(string_to_array(r.answer #>> '{}', '|')) x);
      elsif r.type = 'matching' then
        n := jsonb_array_length(r.options); good := 0;
        for pr in select * from jsonb_array_elements(r.options) loop
          if (resp ->> (pr->>'left')) = (pr->>'right') then good := good + 1; end if;
        end loop;
        earned := case when n > 0 then r.points * good::numeric / n else 0 end;
        ok := (n > 0 and good = n);
      end if;
      if r.type <> 'matching' and ok then earned := r.points; end if;
    end if;
    insert into answers(attempt_id, question_id, response, is_correct, points_earned)
    values (att, r.id, resp, ok, earned);
    tot := tot + r.points; sc := sc + earned;
  end loop;

  update attempts set score = sc, total = tot,
         percentage = case when tot > 0 then round(sc / tot * 100, 2) else 0 end
   where id = att;

  select full_name into sname from profiles where id = auth.uid();
  insert into activities(actor_id, room_id, kind, text)
  values (auth.uid(), qz.room_id, 'quiz_submitted',
          sname || ' scored ' || (case when tot > 0 then round(sc / tot * 100) else 0 end)::text || '% on "' || qz.title || '"');
  return att;
end $$;

create or replace function public.get_attempt_review(p_quiz uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare att uuid;
begin
  select id into att from attempts where quiz_id = p_quiz and student_id = auth.uid();
  if att is null then return null; end if;
  return jsonb_build_object(
    'attempt', (select to_jsonb(a) from attempts a where a.id = att),
    'quiz',    (select jsonb_build_object('id', z.id, 'title', z.title, 'room_id', z.room_id) from quizzes z where z.id = p_quiz),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'question_id', q.id, 'type', q.type, 'text', q.text, 'points', q.points,
        'earned', an.points_earned, 'is_correct', an.is_correct, 'response', an.response,
        'answer', case when q.type = 'matching' then q.options else q.answer end) order by q.position)
      from questions q left join answers an on an.question_id = q.id and an.attempt_id = att
      where q.quiz_id = p_quiz), '[]'::jsonb));
end $$;

revoke execute on function public.join_room(text) from public, anon;
revoke execute on function public.get_quiz_for_student(uuid) from public, anon;
revoke execute on function public.submit_attempt(uuid, jsonb) from public, anon;
revoke execute on function public.get_attempt_review(uuid) from public, anon;
grant execute on function public.join_room(text) to authenticated;
grant execute on function public.get_quiz_for_student(uuid) to authenticated;
grant execute on function public.submit_attempt(uuid, jsonb) to authenticated;
grant execute on function public.get_attempt_review(uuid) to authenticated;
