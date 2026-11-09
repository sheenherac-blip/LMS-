-- Table: questions
create table if not exists public.questions (
  id         uuid primary key default gen_random_uuid(),
  quiz_id    uuid not null references public.quizzes(id) on delete cascade,
  position   int not null default 0,
  type       text not null check (type in ('multiple_choice','identification','matching','true_false')),
  text       text not null,
  points     numeric not null default 1,
  difficulty text not null default 'medium' check (difficulty in ('easy','medium','hard')),
  options    jsonb,   -- multiple_choice: ["a","b"]  | matching: [{"left":"CPU","right":"Process data"}]
  answer     jsonb    -- multiple_choice: "text" | identification: "a|b" | true_false: "true"/"false"
);
