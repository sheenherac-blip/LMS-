-- Table: activities
create table if not exists public.activities (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references public.profiles(id) on delete set null,
  room_id    uuid references public.rooms(id) on delete cascade,
  kind       text not null,
  text       text not null,
  created_at timestamptz not null default now()
);
