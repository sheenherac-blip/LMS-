-- Avatar storage bucket + policies
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars read" on storage.objects;
create policy "avatars read" on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists "avatars insert own" on storage.objects;
create policy "avatars insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars update own" on storage.objects;
create policy "avatars update own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars delete own" on storage.objects;
create policy "avatars delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================
-- FIRST ADMIN: create a user in Authentication > Users (tick "Auto confirm"),
-- then run this with that user's email:
--
--   insert into public.profiles (id, email, full_name, role)
--   select id, email, 'Administrator', 'admin' from auth.users
--   where email = 'you@example.com';
-- =====================================================================

-- =====================================================================
-- FIRST ADMIN: create a user in Authentication > Users (tick "Auto confirm"),
-- then run this with that user's email:
--
--   insert into public.profiles (id, email, full_name, role)
--   select id, email, 'Administrator', 'admin' from auth.users
--   where email = 'you@example.com';
-- =====================================================================
