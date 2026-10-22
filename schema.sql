-- LearnLoop database setup for Supabase.
-- Run in Supabase Dashboard -> SQL Editor -> New query.
-- Uses Row Level Security. Never disable RLS or put a service_role key in the browser.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'LearnLoop member' check (char_length(display_name) between 1 and 60),
  bio text not null default '' check (char_length(bio) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 10000),
  post_type text not null default 'Discussion' check (post_type in ('Discussion','Document','Photo','Video','Story','Link')),
  subject text not null default 'General' check (char_length(subject) <= 60),
  file_path text,
  file_name text check (file_name is null or char_length(file_name) <= 255),
  file_mime text,
  repost_of uuid references public.posts(id) on delete set null,
  status text not null default 'published' check (status in ('published','hidden','removed')),
  created_at timestamptz not null default now()
);

create table if not exists public.reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'like' check (kind in ('like','helpful','insightful')),
  created_at timestamptz not null default now(),
  primary key(post_id,user_id,kind)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  status text not null default 'published' check (status in ('published','hidden','removed')),
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 100),
  details text not null default '' check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(reporter_id,post_id)
);

create table if not exists public.moderators (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Platform owner identity is managed only in the Supabase SQL editor (never from the browser).
create table if not exists public.platform_owners (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Private owner-only preferences. These are preferences, not live payment or ad-network integrations.
create table if not exists public.platform_revenue_settings (
  id boolean primary key default true check (id = true),
  enabled_methods text[] not null default array['ads','sponsorships']::text[] check (enabled_methods <@ array['ads','sponsorships','referrals','support']::text[]),
  ad_placement text not null default 'limited' check (ad_placement in ('limited','logged_out','none')),
  updated_at timestamptz not null default now()
);
insert into public.platform_revenue_settings (id) values (true) on conflict (id) do nothing;

create index if not exists posts_created_at_idx on public.posts(created_at desc);
create index if not exists posts_subject_idx on public.posts(subject);
create index if not exists posts_status_created_idx on public.posts(status,created_at desc);
create index if not exists comments_post_created_idx on public.comments(post_id,created_at);
create index if not exists reports_status_created_idx on public.reports(status,created_at desc);

-- New auth users receive a profile. Metadata is provided by the signup form.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'LearnLoop member'))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_platform_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.platform_owners where user_id = auth.uid());
$$;

create or replace function public.is_moderator()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.moderators where user_id = auth.uid());
$$;

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.reactions enable row level security;
alter table public.comments enable row level security;
alter table public.reports enable row level security;
alter table public.moderators enable row level security;
alter table public.platform_owners enable row level security;
alter table public.platform_revenue_settings enable row level security;

drop policy if exists "Profiles visible to community" on public.profiles;
create policy "Profiles visible to community" on public.profiles for select to authenticated using (true);
drop policy if exists "Users create own profile" on public.profiles;
create policy "Users create own profile" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "Read published posts" on public.posts;
create policy "Read published posts" on public.posts for select to authenticated using (status = 'published' or user_id = auth.uid() or public.is_moderator());
drop policy if exists "Create own posts" on public.posts;
create policy "Create own posts" on public.posts for insert to authenticated with check (user_id = auth.uid() and status = 'published');
drop policy if exists "Owners delete own posts or moderators" on public.posts;
create policy "Owners delete own posts or moderators" on public.posts for delete to authenticated using (user_id = auth.uid() or public.is_moderator());
drop policy if exists "Moderators update post status" on public.posts;
create policy "Moderators update post status" on public.posts for update to authenticated using (public.is_moderator()) with check (public.is_moderator());

drop policy if exists "Read reactions" on public.reactions;
create policy "Read reactions" on public.reactions for select to authenticated using (true);
drop policy if exists "Users add own reactions" on public.reactions;
create policy "Users add own reactions" on public.reactions for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Users remove own reactions" on public.reactions;
create policy "Users remove own reactions" on public.reactions for delete to authenticated using (user_id = auth.uid());

drop policy if exists "Read published comments" on public.comments;
create policy "Read published comments" on public.comments for select to authenticated using (status = 'published' or user_id = auth.uid() or public.is_moderator());
drop policy if exists "Create own comments" on public.comments;
create policy "Create own comments" on public.comments for insert to authenticated with check (user_id = auth.uid() and status = 'published');
drop policy if exists "Owners delete own comments or moderators" on public.comments;
create policy "Owners delete own comments or moderators" on public.comments for delete to authenticated using (user_id = auth.uid() or public.is_moderator());
drop policy if exists "Moderators update comment status" on public.comments;
create policy "Moderators update comment status" on public.comments for update to authenticated using (public.is_moderator()) with check (public.is_moderator());

drop policy if exists "Users create reports" on public.reports;
create policy "Users create reports" on public.reports for insert to authenticated with check (reporter_id = auth.uid());
drop policy if exists "Users read own reports moderators read all" on public.reports;
create policy "Users read own reports moderators read all" on public.reports for select to authenticated using (reporter_id = auth.uid() or public.is_moderator());
drop policy if exists "Moderators review reports" on public.reports;
create policy "Moderators review reports" on public.reports for update to authenticated using (public.is_moderator()) with check (public.is_moderator());

-- Platform owner identity cannot be assigned from the public client. Owner can read their own membership only.
drop policy if exists "Owner can see own owner membership" on public.platform_owners;
create policy "Owner can see own owner membership" on public.platform_owners for select to authenticated using (user_id = auth.uid());
drop policy if exists "Only platform owner reads revenue settings" on public.platform_revenue_settings;
create policy "Only platform owner reads revenue settings" on public.platform_revenue_settings for select to authenticated using (public.is_platform_owner());
drop policy if exists "Only platform owner inserts revenue settings" on public.platform_revenue_settings;
create policy "Only platform owner inserts revenue settings" on public.platform_revenue_settings for insert to authenticated with check (public.is_platform_owner());
drop policy if exists "Only platform owner updates revenue settings" on public.platform_revenue_settings;
create policy "Only platform owner updates revenue settings" on public.platform_revenue_settings for update to authenticated using (public.is_platform_owner()) with check (public.is_platform_owner());

-- Users cannot query or assign moderator membership through the public client.
drop policy if exists "Users see own moderator membership" on public.moderators;
create policy "Users see own moderator membership" on public.moderators for select to authenticated using (user_id = auth.uid());

-- Private file bucket. Objects are private and served using short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('learning-files', 'learning-files', false, 52428800,
  array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain','text/csv','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists "Authenticated users can view learning files" on storage.objects;
create policy "Authenticated users can view learning files" on storage.objects for select to authenticated
using (bucket_id = 'learning-files');
drop policy if exists "Users upload files into own folder" on storage.objects;
create policy "Users upload files into own folder" on storage.objects for insert to authenticated
with check (bucket_id = 'learning-files' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users delete own files" on storage.objects;
create policy "Users delete own files" on storage.objects for delete to authenticated
using (bucket_id = 'learning-files' and (storage.foldername(name))[1] = auth.uid()::text);

-- Optional: enable Realtime for new posts. If already in publication, ignore the duplicate warning.
do $$ begin
  alter publication supabase_realtime add table public.posts;
exception when duplicate_object then null;
when undefined_object then null;
end $$;
