-- Code Connect · Hypervision — registrations table
-- Run once in Supabase → SQL Editor → New query

create table if not exists public.code_connect_registrations (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  full_name      text not null check (full_name ~ '^[A-Za-z]+( [A-Za-z]+)*$' and char_length(full_name) >= 2),
  sap_id         text not null unique check (sap_id ~ '^5900[0-9]{5}$'),
  year           smallint not null check (year between 1 and 4),
  contact_number text not null check (contact_number ~ '^[6-9][0-9]{9}$'),
  college_email  text not null unique check (college_email ~* '^[a-z]+\.[0-9]{5}@stu\.upes\.ac\.in$'),
  interests      text[] not null check (cardinality(interests) >= 1),
  other_interest text
);

-- Row Level Security: browser (publishable key = anon role) can INSERT only.
alter table public.code_connect_registrations enable row level security;

drop policy if exists "anon can insert registrations" on public.code_connect_registrations;
create policy "anon can insert registrations"
  on public.code_connect_registrations
  for insert
  to anon
  with check (true);

grant insert on public.code_connect_registrations to anon;
-- No select/update/delete policies → nobody can read or edit rows from the browser.
