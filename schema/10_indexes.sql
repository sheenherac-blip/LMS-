-- Indexes
create index if not exists idx_rooms_teacher on public.rooms(teacher_id);
create index if not exists idx_rooms_course on public.rooms(course_id);
create index if not exists idx_rs_student on public.room_students(student_id);
create index if not exists idx_quizzes_room on public.quizzes(room_id);
create index if not exists idx_questions_quiz on public.questions(quiz_id);
create index if not exists idx_attempts_quiz on public.attempts(quiz_id);
create index if not exists idx_attempts_student on public.attempts(student_id);
create index if not exists idx_answers_attempt on public.answers(attempt_id);
create index if not exists idx_activities_room on public.activities(room_id, created_at desc);
