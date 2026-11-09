-- Table: rooms
create table if not exists public.rooms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  course_id   uuid not null references public.courses(id) on delete restrict,
  teacher_id  uuid not null references public.profiles(id) on delete restrict,
  section     text,
  description text,
  school_year text,
  semester    text,
  code        text not null unique default upper(substr(encode(gen_random_bytes(4),'hex'),1,6)),
  status      text not null default 'active' check (status in ('active','inactive')),
  created_at  timestamptz not null default now()
);
