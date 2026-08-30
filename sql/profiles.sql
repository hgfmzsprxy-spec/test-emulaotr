-- Unique display names
-- Paste this in Supabase: SQL Editor → Run
-- Required for registration, Discord/Google OAuth, and Affiliates codes (JANE10).
-- Re-run this whole file after changes. Discord sign-up fails if the old
-- trigger still raises on missing/taken display names.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  name_key text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_name_key_idx on public.profiles (name_key);
create unique index if not exists profiles_slug_idx on public.profiles (slug);

alter table public.profiles enable row level security;

create or replace function public.sync_profile_from_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_name text;
  candidate text;
  name_key text;
  slug text;
  is_oauth boolean;
  suffix int;
begin
  is_oauth := lower(coalesce(new.raw_app_meta_data->>'provider', 'email')) <> 'email';

  raw_name := nullif(btrim(regexp_replace(coalesce(
    new.raw_user_meta_data->>'display_name',
    new.raw_user_meta_data->'custom_claims'->>'global_name',
    new.raw_user_meta_data->>'global_name',
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'user_name',
    new.raw_user_meta_data->>'preferred_username',
    new.raw_user_meta_data->>'username',
    split_part(coalesce(new.email, ''), '@', 1)
  ), '\s+', ' ', 'g')), '');

  if raw_name is not null and char_length(raw_name) > 32 then
    raw_name := left(raw_name, 32);
  end if;

  if raw_name is null or char_length(raw_name) < 2 then
    if is_oauth then
      raw_name := 'User' || left(replace(new.id::text, '-', ''), 6);
    else
      raise exception 'Enter a display name.';
    end if;
  end if;

  slug := upper(regexp_replace(raw_name, '[^A-Za-z0-9]', '', 'g'));
  if char_length(slug) < 2 then
    if is_oauth then
      raw_name := 'User' || left(replace(new.id::text, '-', ''), 6);
      slug := upper(raw_name);
    else
      raise exception 'Display name must include letters or numbers.';
    end if;
  end if;

  if is_oauth then
    begin
      insert into public.profiles (user_id, display_name, name_key, slug, updated_at)
      values (new.id, raw_name, lower(raw_name), slug, now())
      on conflict (user_id) do update
        set display_name = excluded.display_name,
            name_key = excluded.name_key,
            slug = excluded.slug,
            updated_at = now();
      return new;
    exception
      when unique_violation then
        if TG_OP = 'UPDATE' then
          return new;
        end if;
    end;

    for suffix in 2..99 loop
      candidate := left(raw_name, greatest(2, 32 - char_length(suffix::text))) || suffix::text;
      begin
        insert into public.profiles (user_id, display_name, name_key, slug, updated_at)
        values (
          new.id,
          candidate,
          lower(candidate),
          upper(regexp_replace(candidate, '[^A-Za-z0-9]', '', 'g')),
          now()
        )
        on conflict (user_id) do update
          set display_name = excluded.display_name,
              name_key = excluded.name_key,
              slug = excluded.slug,
              updated_at = now();
        return new;
      exception
        when unique_violation then
          null;
      end;
    end loop;

    candidate := 'User' || left(replace(new.id::text, '-', ''), 8);
    insert into public.profiles (user_id, display_name, name_key, slug, updated_at)
    values (new.id, candidate, lower(candidate), upper(candidate), now())
    on conflict (user_id) do nothing;
    return new;
  end if;

  insert into public.profiles (user_id, display_name, name_key, slug, updated_at)
  values (new.id, raw_name, lower(raw_name), slug, now())
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        name_key = excluded.name_key,
        slug = excluded.slug,
        updated_at = now();

  return new;
exception
  when unique_violation then
    if is_oauth then
      return new;
    end if;
    raise exception 'That display name is already taken.';
  when others then
    if is_oauth then
      return new;
    end if;
    raise;
end;
$$;

drop trigger if exists on_auth_user_profile on auth.users;
create trigger on_auth_user_profile
  after insert or update of raw_user_meta_data on auth.users
  for each row execute function public.sync_profile_from_user();

do $$
declare
  r record;
begin
  for r in
    select
      u.id,
      nullif(btrim(regexp_replace(coalesce(
        u.raw_user_meta_data->>'display_name',
        u.raw_user_meta_data->'custom_claims'->>'global_name',
        u.raw_user_meta_data->>'global_name',
        u.raw_user_meta_data->>'full_name',
        u.raw_user_meta_data->>'name',
        split_part(coalesce(u.email, ''), '@', 1)
      ), '\s+', ' ', 'g')), '') as display_name
    from auth.users u
  loop
    if r.display_name is null or char_length(r.display_name) < 2 then
      continue;
    end if;
    if char_length(upper(regexp_replace(r.display_name, '[^A-Za-z0-9]', '', 'g'))) < 2 then
      continue;
    end if;
    begin
      insert into public.profiles (user_id, display_name, name_key, slug)
      values (
        r.id,
        left(r.display_name, 32),
        lower(left(r.display_name, 32)),
        upper(regexp_replace(left(r.display_name, 32), '[^A-Za-z0-9]', '', 'g'))
      )
      on conflict (user_id) do nothing;
    exception
      when unique_violation then
        null;
    end;
  end loop;
end $$;
