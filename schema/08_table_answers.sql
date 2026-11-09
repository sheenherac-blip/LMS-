-- Table: answers
create table if not exists public.answers (
  id            uuid primary key default gen_random_uuid(),
  attempt_id    uuid not null references public.attempts(id) on delete cascade,
  question_id   uuid not null references public.questions(id) on delete cascade,
  response      jsonb,
  is_correct    boolean not null default false,
  points_earned numeric not null default 0
);
