-- Row Level Security
alter table public.profiles       enable row level security;
alter table public.courses        enable row level security;
alter table public.rooms          enable row level security;
alter table public.room_students  enable row level security;
alter table public.quizzes        enable row level security;
alter table public.questions      enable row level security;
alter table public.attempts       enable row level security;
alter table public.answers        enable row level security;
alter table public.activities     enable row level security;

-- profiles (names/emails are visible to signed-in users; role/status/ID are protected by trigger)
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (true);
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- inserts/deletes happen only through the admin-users Edge Function (service role)

-- courses
drop policy if exists courses_select on public.courses;
create policy courses_select on public.courses for select to authenticated using (true);
drop policy if exists courses_admin on public.courses;
create policy courses_admin on public.courses for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- rooms
drop policy if exists rooms_select on public.rooms;
create policy rooms_select on public.rooms for select to authenticated
  using (public.is_admin() or teacher_id = auth.uid() or public.is_room_member(id));
drop policy if exists rooms_insert on public.rooms;
create policy rooms_insert on public.rooms for insert to authenticated
  with check (public.is_admin() or (
    teacher_id = auth.uid() and public.my_role() = 'teacher'
    and exists(select 1 from public.courses c where c.id = course_id and c.teacher_id = auth.uid())));
drop policy if exists rooms_update on public.rooms;
create policy rooms_update on public.rooms for update to authenticated
  using (public.is_admin() or teacher_id = auth.uid())
  with check (public.is_admin() or teacher_id = auth.uid());
drop policy if exists rooms_delete on public.rooms;
create policy rooms_delete on public.rooms for delete to authenticated
  using (public.is_admin() or teacher_id = auth.uid());

-- room_students (students join through join_room())
drop policy if exists rs_select on public.room_students;
create policy rs_select on public.room_students for select to authenticated
  using (public.is_admin() or student_id = auth.uid() or public.is_room_teacher(room_id));
drop policy if exists rs_insert on public.room_students;
create policy rs_insert on public.room_students for insert to authenticated
  with check (public.is_admin() or public.is_room_teacher(room_id));
drop policy if exists rs_delete on public.room_students;
create policy rs_delete on public.room_students for delete to authenticated
  using (public.is_admin() or public.is_room_teacher(room_id));

-- quizzes
drop policy if exists quizzes_select on public.quizzes;
create policy quizzes_select on public.quizzes for select to authenticated
  using (public.is_admin() or public.is_room_teacher(room_id)
         or (status = 'published' and public.is_room_member(room_id)));
drop policy if exists quizzes_write on public.quizzes;
create policy quizzes_write on public.quizzes for all to authenticated
  using (public.is_room_teacher(room_id)) with check (public.is_room_teacher(room_id));

-- questions: students never read this table (answers!) – they use get_quiz_for_student()
drop policy if exists questions_select on public.questions;
create policy questions_select on public.questions for select to authenticated
  using (public.is_admin() or public.is_quiz_teacher(quiz_id));
drop policy if exists questions_write on public.questions;
create policy questions_write on public.questions for all to authenticated
  using (public.is_quiz_teacher(quiz_id)) with check (public.is_quiz_teacher(quiz_id));

-- attempts / answers are written only by submit_attempt()
drop policy if exists attempts_select on public.attempts;
create policy attempts_select on public.attempts for select to authenticated
  using (student_id = auth.uid() or public.is_admin() or public.is_quiz_teacher(quiz_id));
drop policy if exists answers_select on public.answers;
create policy answers_select on public.answers for select to authenticated
  using (public.is_admin() or exists(
    select 1 from public.attempts a where a.id = attempt_id
      and (a.student_id = auth.uid() or public.is_quiz_teacher(a.quiz_id))));

-- activities (written only by triggers / RPCs)
drop policy if exists activities_select on public.activities;
create policy activities_select on public.activities for select to authenticated
  using (public.is_admin() or actor_id = auth.uid()
         or (room_id is not null and public.is_room_teacher(room_id))
         or (room_id is not null and kind = 'quiz_published' and public.is_room_member(room_id)));
