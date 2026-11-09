-- Table: quizzes
create table if not exists public.quizzes (
  id                 uuid primary key default gen_random_uuid(),
  room_id            uuid not null references public.rooms(id) on delete cascade,
  title              text not null,
  description        text,
  time_limit_minutes int,
  due_date           timestamptz,
  total_points       numeric not null default 0,
  question_count     int not null default 0,
  status             text not null default 'draft' check (status in ('draft','published')),
  created_at         timestamptz not null default now()
);
