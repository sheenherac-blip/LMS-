-- Table: room_students
create table if not exists public.room_students (
  room_id    uuid not null references public.rooms(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (room_id, student_id)
);
