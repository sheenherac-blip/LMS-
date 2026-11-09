-- Table: attempts
create table if not exists public.attempts (
  id           uuid primary key default gen_random_uuid(),
  quiz_id      uuid not null references public.quizzes(id) on delete cascade,
  student_id   uuid not null references public.profiles(id) on delete cascade,
  score        numeric not null default 0,
  total        numeric not null default 0,
  percentage   numeric not null default 0,
  submitted_at timestamptz not null default now(),
  unique (quiz_id, student_id)
);
