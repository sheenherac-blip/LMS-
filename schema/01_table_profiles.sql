-- Table: profiles
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  code        text unique,
  full_name   text not null default '',
  email       text not null,
  role        text not null check (role in ('admin','teacher','student')),
  status      text not null default 'active' check (status in ('active','inactive')),
  avatar_url  text,
  settings    jsonb not null default '{"notify_quiz":true,"notify_room":true,"notify_email":false,"theme":"light"}'::jsonb,
  created_at  timestamptz not null default now()
);
