-- Helper functions used by RLS
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select role = 'admin' and status = 'active' from public.profiles where id = auth.uid()), false) $$;

create or replace function public.is_room_teacher(rid uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists(select 1 from public.rooms where id = rid and teacher_id = auth.uid()) $$;

create or replace function public.is_room_member(rid uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists(select 1 from public.room_students where room_id = rid and student_id = auth.uid()) $$;

create or replace function public.is_quiz_teacher(qid uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists(select 1 from public.quizzes z join public.rooms r on r.id = z.room_id
                 where z.id = qid and r.teacher_id = auth.uid()) $$;

-- Triggers
create or replace function public.set_profile_code() returns trigger
language plpgsql as $$
begin
  if new.code is null then
    new.code := case new.role
      when 'admin'   then 'ADM '  || lpad(nextval('seq_admin')::text, 3, '0')
      when 'teacher' then 'TCHR ' || lpad(nextval('seq_teacher')::text, 3, '0')
      else                'STD '  || lpad(nextval('seq_student')::text, 3, '0') end;
  end if;
  return new;
end $$;
drop trigger if exists trg_profile_code on public.profiles;
create trigger trg_profile_code before insert on public.profiles
  for each row execute function public.set_profile_code();

create or replace function public.protect_profile() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role <> old.role or new.status <> old.status or new.code is distinct from old.code then
      raise exception 'Not allowed to change role, status or ID';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_profile_protect on public.profiles;
create trigger trg_profile_protect before update on public.profiles
  for each row execute function public.protect_profile();

-- activity feed triggers
create or replace function public.log_profile_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into activities(actor_id, kind, text)
  values (auth.uid(), 'user_created', 'New ' || new.role || ' account created: ' || new.full_name);
  return new;
end $$;
drop trigger if exists trg_log_profile on public.profiles;
create trigger trg_log_profile after insert on public.profiles
  for each row execute function public.log_profile_created();

create or replace function public.log_room_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into activities(actor_id, room_id, kind, text)
  values (new.teacher_id, new.id, 'room_created', 'Room "' || new.name || '" was created');
  return new;
end $$;
drop trigger if exists trg_log_room on public.rooms;
create trigger trg_log_room after insert on public.rooms
  for each row execute function public.log_room_created();

create or replace function public.log_student_joined() returns trigger
language plpgsql security definer set search_path = public as $$
declare rn text; sn text;
begin
  select name into rn from rooms where id = new.room_id;
  select full_name into sn from profiles where id = new.student_id;
  insert into activities(actor_id, room_id, kind, text)
  values (new.student_id, new.room_id, 'student_joined', sn || ' joined "' || rn || '"');
  return new;
end $$;
drop trigger if exists trg_log_join on public.room_students;
create trigger trg_log_join after insert on public.room_students
  for each row execute function public.log_student_joined();

create or replace function public.log_quiz_published() returns trigger
language plpgsql security definer set search_path = public as $$
declare rn text; tid uuid;
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
    select name, teacher_id into rn, tid from rooms where id = new.room_id;
    insert into activities(actor_id, room_id, kind, text)
    values (tid, new.room_id, 'quiz_published', 'Quiz "' || new.title || '" was published in "' || rn || '"');
  end if;
  return new;
end $$;
drop trigger if exists trg_log_quiz on public.quizzes;
create trigger trg_log_quiz after insert or update on public.quizzes
  for each row execute function public.log_quiz_published();
