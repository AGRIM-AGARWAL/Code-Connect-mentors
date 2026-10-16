-- Code Connect · Hypervision — FULL DATABASE SETUP (one paste)
-- Generated from 01_registrations.sql + 02_quiz.sql + 03_seed.sql by `npm run seed`. Do not edit by hand.
-- Safe to re-run: keeps student data and team sizes.
-- After it runs, set the admin password with the last statement at the bottom (change the text!).

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

-- Code Connect · Hypervision — mentors, quiz, teams
-- Run AFTER 01_registrations.sql, in Supabase → SQL Editor → New query.
-- Safe to re-run: it replaces functions and only creates tables that don't exist.
--
-- Security model
--   • The browser uses the publishable (anon) key.
--   • Only `mentors` is readable directly (public info).
--   • Everything else (answer keys, answers, scores, teams) is reachable ONLY
--     through the functions below, which check a student session token or
--     the admin password. Scoring and timing happen on the server.

create extension if not exists pgcrypto with schema extensions;

-- ── Tables ─────────────────────────────────────────────────────────────

create table if not exists public.settings (
  id                int primary key default 1 check (id = 1),
  quiz_open         boolean not null default false,
  question_seconds  int     not null default 30 check (question_seconds between 10 and 300),
  points_correct    numeric not null default 4,
  points_wrong      numeric not null default -1,
  speed_bonus_max   numeric not null default 2,
  admin_hash        text
);
insert into public.settings (id) values (1) on conflict do nothing;

create table if not exists public.mentors (
  id          text primary key check (id ~ '^[a-z0-9_-]+$'),
  name        text not null,
  tagline     text,
  highlights  text[] not null default '{}',
  github      text,
  linkedin    text,
  min_team    int  not null default 5,
  max_team    int  not null default 8,
  active      boolean not null default true,
  sort        int  not null default 0,
  check (min_team >= 0 and max_team >= min_team)
);
-- display extras (optional): accent colour '#RRGGBB' and a photo URL
alter table public.mentors add column if not exists accent text;
alter table public.mentors add column if not exists photo_url text;

-- The interest "dimensions" (same as the mentor Google Form questions).
-- options = mentor-form wording; index order must match the student question options.
create table if not exists public.interest_keys (
  qkey           text primary key,
  mentor_prompt  text not null,
  options        text[] not null,
  sort           int not null default 0
);

-- A mentor's own answer to each interest key (filled from the Google Form).
create table if not exists public.mentor_interests (
  mentor_id  text references public.mentors(id) on delete cascade,
  qkey       text references public.interest_keys(qkey) on delete cascade,
  answer     int  not null check (answer >= 0),
  primary key (mentor_id, qkey)
);

-- Quiz questions. kind = 'skill' uses `correct`; kind = 'interest' is scored
-- against mentor_interests (match = correct) via `qkey`.
create table if not exists public.questions (
  id         text primary key,
  mentor_id  text not null references public.mentors(id) on delete cascade,
  kind       text not null check (kind in ('skill', 'interest')),
  qkey       text references public.interest_keys(qkey),
  prompt     text not null,
  options    text[] not null check (cardinality(options) between 2 and 6),
  correct    int,
  position   int  not null default 0,
  active     boolean not null default true,
  check ((kind = 'skill' and correct is not null and correct >= 0 and correct < cardinality(options))
      or (kind = 'interest' and qkey is not null))
);

create table if not exists public.sessions (
  token       uuid primary key default gen_random_uuid(),
  sap_id      text not null references public.code_connect_registrations(sap_id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.choices (
  sap_id       text primary key references public.code_connect_registrations(sap_id) on delete cascade,
  m1           text not null references public.mentors(id),
  m2           text not null references public.mentors(id),
  m3           text not null references public.mentors(id),
  created_at   timestamptz not null default now(),
  finished_at  timestamptz,
  check (m1 <> m2 and m1 <> m3 and m2 <> m3)
);

create table if not exists public.answers (
  sap_id       text not null references public.code_connect_registrations(sap_id) on delete cascade,
  question_id  text not null references public.questions(id) on delete cascade,
  served_at    timestamptz not null default now(),
  answered_at  timestamptz,
  choice       int,
  seconds      numeric,
  points       numeric not null default 0,
  primary key (sap_id, question_id)
);

create table if not exists public.teams (
  sap_id      text primary key references public.code_connect_registrations(sap_id) on delete cascade,
  mentor_id   text not null references public.mentors(id) on delete cascade,
  via         text not null,     -- 'choice1' | 'choice2' | 'choice3' | 'interest'
  score       numeric,
  created_at  timestamptz not null default now()
);

-- ── Row Level Security ─────────────────────────────────────────────────
alter table public.settings         enable row level security;
alter table public.mentors          enable row level security;
alter table public.interest_keys    enable row level security;
alter table public.mentor_interests enable row level security;
alter table public.questions        enable row level security;
alter table public.sessions         enable row level security;
alter table public.choices          enable row level security;
alter table public.answers          enable row level security;
alter table public.teams            enable row level security;

drop policy if exists "public can read active mentors" on public.mentors;
create policy "public can read active mentors" on public.mentors
  for select to anon, authenticated using (active);
grant select on public.mentors to anon, authenticated;
-- No other policies: the other tables are not readable/writable from the browser.

-- ── Helpers ────────────────────────────────────────────────────────────

create or replace function public._student(p_token uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  select sap_id into v from sessions where token = p_token;
  if v is null then raise exception 'INVALID_SESSION'; end if;
  return v;
end $$;

create or replace function public._admin(p_pw text) returns void
language plpgsql stable security definer set search_path = public, extensions as $$
declare h text;
begin
  select admin_hash into h from settings where id = 1;
  if h is null then raise exception 'ADMIN_NOT_SET'; end if;
  if p_pw is null or extensions.crypt(p_pw, h) <> h then raise exception 'BAD_PASSWORD'; end if;
end $$;

-- ── Student functions ──────────────────────────────────────────────────

-- A test account (see test_accounts at the bottom) that already finished gets a fresh quiz on login.
create or replace function public.student_login(p_sap text, p_email text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare r code_connect_registrations; t uuid;
begin
  select * into r from code_connect_registrations
   where sap_id = trim(p_sap) and college_email = lower(trim(p_email));
  if not found then raise exception 'NOT_REGISTERED'; end if;
  if exists (select 1 from test_accounts where sap_id = r.sap_id)
     and exists (select 1 from choices where sap_id = r.sap_id and finished_at is not null) then
    perform _wipe_progress(r.sap_id);
  end if;
  insert into sessions (sap_id) values (r.sap_id) returning token into t;
  return jsonb_build_object('token', t, 'name', r.full_name, 'sap_id', r.sap_id);
end $$;

create or replace function public.student_status(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_sap text; r code_connect_registrations; c choices; s settings;
begin
  v_sap := _student(p_token);
  select * into r from code_connect_registrations where sap_id = v_sap;
  select * into c from choices where sap_id = v_sap;
  select * into s from settings where id = 1;
  return jsonb_build_object(
    'name', r.full_name,
    'sap_id', v_sap,
    'quiz_open', s.quiz_open,
    'question_seconds', s.question_seconds,
    'choices', case when c.sap_id is null then null else jsonb_build_array(c.m1, c.m2, c.m3) end,
    'stage', case when c.sap_id is null then 'choose'
                  when c.finished_at is not null then 'done'
                  else 'quiz' end
  );
end $$;

create or replace function public.save_choices(p_token uuid, p_m1 text, p_m2 text, p_m3 text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_sap text; n int;
begin
  v_sap := _student(p_token);
  if not (select quiz_open from settings where id = 1) then raise exception 'QUIZ_CLOSED'; end if;
  if p_m1 = p_m2 or p_m1 = p_m3 or p_m2 = p_m3 then raise exception 'PICK_3_DIFFERENT'; end if;
  select count(*) into n from mentors where active and id in (p_m1, p_m2, p_m3);
  if n <> 3 then raise exception 'UNKNOWN_MENTOR'; end if;
  insert into choices (sap_id, m1, m2, m3) values (v_sap, p_m1, p_m2, p_m3);
exception when unique_violation then
  raise exception 'ALREADY_CHOSEN';
end $$;

-- Returns the student's current question (serving it starts the server clock),
-- {"done": true} when finished, or {"closed": true} when the admin closed the quiz.
-- A refresh returns the SAME question with the remaining time — no extra time.
create or replace function public.next_question(p_token uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_sap text; c choices; s settings; q record; v_total int; v_elapsed numeric;
  v_part_total int; v_part_idx int;
begin
  v_sap := _student(p_token);
  select * into c from choices where sap_id = v_sap;
  if not found then raise exception 'NO_CHOICES'; end if;
  if c.finished_at is not null then return jsonb_build_object('done', true); end if;
  select * into s from settings where id = 1;
  if not s.quiz_open then return jsonb_build_object('closed', true); end if;

  loop
    with parts(mentor_id, part) as (values (c.m1, 1), (c.m2, 2), (c.m3, 3)),
    ord as (
      select qq.id, qq.mentor_id, qq.kind, qq.prompt, qq.options, p.part,
             row_number() over (order by p.part, case qq.kind when 'skill' then 0 else 1 end, qq.position, qq.id) as n,
             row_number() over (partition by p.part order by case qq.kind when 'skill' then 0 else 1 end, qq.position, qq.id) as pn,
             count(*) over (partition by p.part) as pt,
             count(*) over () as total
        from parts p join questions qq on qq.mentor_id = p.mentor_id and qq.active
    )
    select o.*, a.served_at, m.name as mentor_name
      into q
      from ord o
      join mentors m on m.id = o.mentor_id
      left join answers a on a.sap_id = v_sap and a.question_id = o.id
     where a.answered_at is null
     order by o.n
     limit 1;

    if not found then
      update choices set finished_at = now() where sap_id = v_sap;
      return jsonb_build_object('done', true);
    end if;

    if q.served_at is null then
      insert into answers (sap_id, question_id, served_at) values (v_sap, q.id, now());
      v_elapsed := 0;
    else
      v_elapsed := extract(epoch from now() - q.served_at);
      if v_elapsed > s.question_seconds + 3 then
        -- timed out (e.g. tab closed): record as skipped, move on
        update answers set answered_at = q.served_at + make_interval(secs => s.question_seconds),
                           choice = null, seconds = s.question_seconds, points = 0
         where sap_id = v_sap and question_id = q.id;
        continue;
      end if;
    end if;

    return jsonb_build_object(
      'id', q.id, 'mentor_id', q.mentor_id, 'mentor_name', q.mentor_name,
      'kind', q.kind, 'prompt', q.prompt, 'options', to_jsonb(q.options),
      'part', q.part, 'index_in_part', q.pn, 'part_total', q.pt,
      'number', q.n, 'total', q.total,
      'seconds', s.question_seconds,
      'seconds_left', greatest(0, s.question_seconds - v_elapsed)
    );
  end loop;
end $$;

-- p_choice = null means "skip". Correctness is never sent back to the browser.
create or replace function public.submit_answer(p_token uuid, p_question_id text, p_choice int) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_sap text; s settings; a answers; q questions; v_elapsed numeric; v_key int; v_points numeric := 0;
begin
  v_sap := _student(p_token);
  select * into s from settings where id = 1;
  if not s.quiz_open then raise exception 'QUIZ_CLOSED'; end if;

  select * into a from answers
   where sap_id = v_sap and question_id = p_question_id and answered_at is null
   for update;
  if not found then raise exception 'NOT_CURRENT_QUESTION'; end if;

  select * into q from questions where id = p_question_id;
  v_elapsed := extract(epoch from now() - a.served_at);

  if p_choice is not null and (p_choice < 0 or p_choice >= cardinality(q.options)) then
    raise exception 'BAD_CHOICE';
  end if;

  if v_elapsed > s.question_seconds + 3 then
    p_choice := null;                                   -- too late = skipped
  end if;

  if p_choice is not null then
    if q.kind = 'skill' then
      v_key := q.correct;
    else
      select mi.answer into v_key from mentor_interests mi
       where mi.mentor_id = q.mentor_id and mi.qkey = q.qkey;
    end if;

    if v_key is null then
      v_points := 0;                                    -- mentor answer not set yet
    elsif p_choice = v_key then
      v_points := s.points_correct
                + round(s.speed_bonus_max * greatest(0, 1 - least(v_elapsed, s.question_seconds) / s.question_seconds), 2);
    else
      v_points := s.points_wrong;
    end if;
  end if;

  update answers
     set answered_at = now(), choice = p_choice,
         seconds = round(least(v_elapsed, s.question_seconds), 2), points = v_points
   where sap_id = v_sap and question_id = p_question_id;
end $$;

-- ── Admin functions (all need the admin password) ──────────────────────

create or replace function public.admin_login(p_pw text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin perform _admin(p_pw); return true; end $$;

create or replace function public.admin_overview(p_pw text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s settings;
begin
  perform _admin(p_pw);
  select * into s from settings where id = 1;
  return jsonb_build_object(
    'quiz_open', s.quiz_open,
    'question_seconds', s.question_seconds,
    'registered', (select count(*) from code_connect_registrations),
    'chose', (select count(*) from choices),
    'finished', (select count(*) from choices where finished_at is not null),
    'teams_generated_at', (select max(created_at) from teams),
    'mentors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'name', m.name, 'active', m.active,
        'min_team', m.min_team, 'max_team', m.max_team,
        'skill_count', (select count(*) from questions q where q.mentor_id = m.id and q.active and q.kind = 'skill'),
        'interest_count', (select count(*) from questions q where q.mentor_id = m.id and q.active and q.kind = 'interest'),
        'interest_missing', (select count(*) from questions q
                              where q.mentor_id = m.id and q.active and q.kind = 'interest'
                                and not exists (select 1 from mentor_interests mi where mi.mentor_id = m.id and mi.qkey = q.qkey)),
        'picked_first', (select count(*) from choices c where c.m1 = m.id),
        'picked_any', (select count(*) from choices c where m.id in (c.m1, c.m2, c.m3))
      ) order by m.sort, m.name) from mentors m), '[]'::jsonb)
  );
end $$;

create or replace function public.admin_set_quiz_open(p_pw text, p_open boolean) returns void
language plpgsql volatile security definer set search_path = public as $$
begin perform _admin(p_pw); update settings set quiz_open = p_open where id = 1; end $$;

create or replace function public.admin_interests(p_pw text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _admin(p_pw);
  return jsonb_build_object(
    'keys', coalesce((select jsonb_agg(jsonb_build_object('qkey', qkey, 'prompt', mentor_prompt, 'options', to_jsonb(options)) order by sort) from interest_keys), '[]'),
    'answers', coalesce((select jsonb_agg(jsonb_build_object('mentor_id', mentor_id, 'qkey', qkey, 'answer', answer)) from mentor_interests), '[]')
  );
end $$;

create or replace function public.admin_set_interest(p_pw text, p_mentor text, p_qkey text, p_answer int) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform _admin(p_pw);
  if p_answer is null then
    delete from mentor_interests where mentor_id = p_mentor and qkey = p_qkey;
  else
    if p_answer < 0 or p_answer >= (select cardinality(options) from interest_keys where qkey = p_qkey) then
      raise exception 'BAD_CHOICE';
    end if;
    insert into mentor_interests (mentor_id, qkey, answer) values (p_mentor, p_qkey, p_answer)
    on conflict (mentor_id, qkey) do update set answer = excluded.answer;
  end if;
end $$;

-- Everything the team generator needs, per student who picked mentors.
create or replace function public.admin_results(p_pw text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _admin(p_pw);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'sap_id', c.sap_id,
      'name', r.full_name,
      'email', r.college_email,
      'phone', r.contact_number,
      'year', r.year,
      'choices', jsonb_build_array(c.m1, c.m2, c.m3),
      'finished', c.finished_at is not null,
      'scores', coalesce((select jsonb_object_agg(x.mentor_id, x.pts) from (
                   select q.mentor_id, sum(a.points) pts from answers a join questions q on q.id = a.question_id
                    where a.sap_id = c.sap_id group by q.mentor_id) x), '{}'),
      'seconds', coalesce((select jsonb_object_agg(x.mentor_id, x.secs) from (
                   select q.mentor_id, sum(coalesce(a.seconds, 0)) secs from answers a join questions q on q.id = a.question_id
                    where a.sap_id = c.sap_id group by q.mentor_id) x), '{}'),
      'interests', coalesce((select jsonb_object_agg(x.qkey, x.choice) from (
                   select distinct on (q.qkey) q.qkey, a.choice from answers a join questions q on q.id = a.question_id
                    where a.sap_id = c.sap_id and q.kind = 'interest' and a.choice is not null
                    order by q.qkey, a.answered_at desc) x), '{}')
    ) order by c.created_at)
    from choices c join code_connect_registrations r on r.sap_id = c.sap_id
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_save_teams(p_pw text, p_rows jsonb) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform _admin(p_pw);
  delete from teams where true;
  insert into teams (sap_id, mentor_id, via, score)
  select x->>'sap_id', x->>'mentor_id', x->>'via', nullif(x->>'score', '')::numeric
    from jsonb_array_elements(p_rows) x;
end $$;

create or replace function public.admin_get_teams(p_pw text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _admin(p_pw);
  return coalesce((select jsonb_agg(jsonb_build_object(
            'sap_id', t.sap_id, 'mentor_id', t.mentor_id, 'via', t.via, 'score', t.score, 'created_at', t.created_at))
          from teams t), '[]'::jsonb);
end $$;

-- Lets a student retake (e.g. their laptop died). Deletes their picks + answers.
create or replace function public.admin_reset_student(p_pw text, p_sap text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform _admin(p_pw);
  delete from answers where sap_id = p_sap;
  delete from choices where sap_id = p_sap;
  delete from teams   where sap_id = p_sap;
end $$;

-- Change a mentor's team size limits (admin page → Control → Mentors).
create or replace function public.admin_set_team_size(p_pw text, p_mentor text, p_min int, p_max int) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform _admin(p_pw);
  if p_min is null or p_max is null or p_min < 0 or p_max < 1 or p_min > p_max or p_max > 50 then
    raise exception 'BAD_TEAM_SIZE';
  end if;
  update mentors set min_team = p_min, max_team = p_max where id = p_mentor;
  if not found then raise exception 'UNKNOWN_MENTOR'; end if;
end $$;

-- Move one student to another mentor's saved team (admin page → Teams).
-- The score shown becomes the student's points in the new mentor's quiz (null if they never took it).
create or replace function public.admin_move_student(p_pw text, p_sap text, p_mentor text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform _admin(p_pw);
  if not exists (select 1 from mentors where id = p_mentor) then raise exception 'UNKNOWN_MENTOR'; end if;
  update teams t
     set mentor_id = p_mentor,
         via = 'manual',
         score = (select sum(a.points) from answers a join questions q on q.id = a.question_id
                   where a.sap_id = p_sap and q.mentor_id = p_mentor)
   where t.sap_id = p_sap;
  if not found then raise exception 'NOT_IN_A_TEAM'; end if;
end $$;

-- ── Who may call what ──────────────────────────────────────────────────
revoke all on function public._student(uuid) from public, anon, authenticated;
revoke all on function public._admin(text)   from public, anon, authenticated;

grant execute on function
  public.student_login(text, text),
  public.student_status(uuid),
  public.save_choices(uuid, text, text, text),
  public.next_question(uuid),
  public.submit_answer(uuid, text, int),
  public.admin_login(text),
  public.admin_overview(text),
  public.admin_set_quiz_open(text, boolean),
  public.admin_interests(text),
  public.admin_set_interest(text, text, text, int),
  public.admin_results(text),
  public.admin_save_teams(text, jsonb),
  public.admin_get_teams(text),
  public.admin_reset_student(text, text),
  public.admin_set_team_size(text, text, int, int),
  public.admin_move_student(text, text, text)
to anon, authenticated;

-- ── Set the admin password (run once, change the text!) ────────────────
-- update public.settings set admin_hash = extensions.crypt('CHANGE-ME', extensions.gen_salt('bf')) where id = 1;

-- ── Test accounts ─────────────────────────────────────
-- SAP IDs listed here can register again and again, and get a fresh quiz
-- each time they register again or log in after finishing.
-- Add/remove:  insert into public.test_accounts values ('5900XXXXX');  /  delete from public.test_accounts where sap_id = '5900XXXXX';
create table if not exists public.test_accounts (sap_id text primary key);
alter table public.test_accounts enable row level security;   -- no policies → not readable from the browser
insert into public.test_accounts values ('590025687') on conflict do nothing;  -- Agrim Agarwal

create or replace function public._wipe_progress(p_sap text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  delete from answers where sap_id = p_sap;
  delete from choices where sap_id = p_sap;
  delete from teams   where sap_id = p_sap;
end $$;
revoke all on function public._wipe_progress(text) from public, anon, authenticated;

-- Re-registering a test account replaces the old registration and wipes its progress.
create or replace function public._test_reregister() returns trigger
language plpgsql volatile security definer set search_path = public as $$
begin
  if exists (select 1 from test_accounts where sap_id = new.sap_id) then
    delete from code_connect_registrations where sap_id = new.sap_id;
    perform _wipe_progress(new.sap_id);
  end if;
  return new;
end $$;
revoke all on function public._test_reregister() from public, anon, authenticated;

drop trigger if exists test_reregister on public.code_connect_registrations;
create trigger test_reregister before insert on public.code_connect_registrations
  for each row execute function public._test_reregister();

-- GENERATED by scripts/build-seed.mjs — edit data/*.json, then run `npm run seed`.
begin;

-- interest keys
insert into public.interest_keys (qkey, mentor_prompt, options, sort) values ('project', 'What kind of project would you like your team to build?', array['Real product / startup-style app', 'Research / paper-style project', 'Open-source contribution', 'Hackathon / competition build', 'Learning-first (fundamentals + mini projects)']::text[], 0)
  on conflict (qkey) do update set mentor_prompt = excluded.mentor_prompt, options = excluded.options, sort = excluded.sort;
insert into public.interest_keys (qkey, mentor_prompt, options, sort) values ('style', 'Your mentoring style', array['Hands-on — I code alongside the team', 'Guide & review — I set direction, review their work', 'Hands-off — the team drives, I unblock when needed']::text[], 1)
  on conflict (qkey) do update set mentor_prompt = excluded.mentor_prompt, options = excluded.options, sort = excluded.sort;
insert into public.interest_keys (qkey, mentor_prompt, options, sort) values ('pace', 'How do you like to work?', array['Structured — fixed weekly goals and check-ins', 'Sprint-based — intense bursts around deadlines', 'Flexible — async, at our own pace']::text[], 2)
  on conflict (qkey) do update set mentor_prompt = excluded.mentor_prompt, options = excluded.options, sort = excluded.sort;
insert into public.interest_keys (qkey, mentor_prompt, options, sort) values ('value', 'What do you value most in a mentee?', array['Consistency', 'Curiosity', 'Technical depth', 'Creativity', 'Communication']::text[], 3)
  on conflict (qkey) do update set mentor_prompt = excluded.mentor_prompt, options = excluded.options, sort = excluded.sort;
insert into public.interest_keys (qkey, mentor_prompt, options, sort) values ('meet', 'Preferred way to meet the team', array['In person on campus', 'Online calls (Meet / Discord)', 'Mostly chat (WhatsApp / Discord)']::text[], 4)
  on conflict (qkey) do update set mentor_prompt = excluded.mentor_prompt, options = excluded.options, sort = excluded.sort;
insert into public.interest_keys (qkey, mentor_prompt, options, sort) values ('time', 'Time you can give per week', array['Under 2 hours', '2–4 hours', '4–6 hours', '6+ hours']::text[], 5)
  on conflict (qkey) do update set mentor_prompt = excluded.mentor_prompt, options = excluded.options, sort = excluded.sort;

-- mentors
insert into public.mentors (id, name, tagline, highlights, github, linkedin, accent, photo_url, min_team, max_team, active, sort) values
  ('om', 'Om Agarwal', 'Python automation, web apps & security tools', array['WhatsApp Group Adder (Python, Selenium)', 'CloudQuiz (Firebase)', 'Security Scanner (PHP)', 'Real-time chat app (Flask, MongoDB)']::text[], 'https://github.com/Omfalcon', 'https://www.linkedin.com/in/om-agarwal16805/', null, 'mentors/om.jpg', 5, 8, true, 0)
  on conflict (id) do update set name = excluded.name, tagline = excluded.tagline, highlights = excluded.highlights,
    github = excluded.github, linkedin = excluded.linkedin, accent = excluded.accent, photo_url = excluded.photo_url,
    active = excluded.active, sort = excluded.sort;  -- team sizes are NOT overwritten: they are edited on the admin page
insert into public.mentors (id, name, tagline, highlights, github, linkedin, accent, photo_url, min_team, max_team, active, sort) values
  ('chirrayu', 'Chirrayu Sharma', 'Full-stack web apps with React, Node & Flask', array['MovieTime (React, Socket.io, Redis)', 'WheelsOnRent (scooter booking)', 'UPES Complaint Management System']::text[], 'https://github.com/chirrayu', 'https://www.linkedin.com/in/chirrayu-sharma-37138b375/', null, 'mentors/chirrayu.jpg', 5, 8, false, 1)
  on conflict (id) do update set name = excluded.name, tagline = excluded.tagline, highlights = excluded.highlights,
    github = excluded.github, linkedin = excluded.linkedin, accent = excluded.accent, photo_url = excluded.photo_url,
    active = excluded.active, sort = excluded.sort;  -- team sizes are NOT overwritten: they are edited on the admin page
insert into public.mentors (id, name, tagline, highlights, github, linkedin, accent, photo_url, min_team, max_team, active, sort) values
  ('dhairya', 'Dhairya Thareja', 'MERN stack developer, AWS cloud', array['CropCare (MERN + Gemini)', 'UrlNest (AWS Lambda + DynamoDB)', 'Internship at Redian Software']::text[], 'https://github.com/dhairyathareja', 'https://www.linkedin.com/in/dhairyathareja/', null, null, 5, 8, true, 2)
  on conflict (id) do update set name = excluded.name, tagline = excluded.tagline, highlights = excluded.highlights,
    github = excluded.github, linkedin = excluded.linkedin, accent = excluded.accent, photo_url = excluded.photo_url,
    active = excluded.active, sort = excluded.sort;  -- team sizes are NOT overwritten: they are edited on the admin page
insert into public.mentors (id, name, tagline, highlights, github, linkedin, accent, photo_url, min_team, max_team, active, sort) values
  ('vanshdeep', 'Vanshdeep Srivastava', 'Full stack, Cloud & DevOps, ML', array['MediLink (Next.js, WebRTC, AI)', 'Small Language Model from scratch', 'Object Monitoring (YOLOv8)', 'AlgoBench (Judge0)']::text[], 'https://github.com/Vanshdeep001', 'https://www.linkedin.com/in/vanshdeep-srivastav-aa6749310/', null, 'mentors/vanshdeep.jpg', 5, 8, true, 3)
  on conflict (id) do update set name = excluded.name, tagline = excluded.tagline, highlights = excluded.highlights,
    github = excluded.github, linkedin = excluded.linkedin, accent = excluded.accent, photo_url = excluded.photo_url,
    active = excluded.active, sort = excluded.sort;  -- team sizes are NOT overwritten: they are edited on the admin page
insert into public.mentors (id, name, tagline, highlights, github, linkedin, accent, photo_url, min_team, max_team, active, sort) values
  ('khushi', 'Khushi Verma', 'C, DSA & Python fundamentals', array['100 Days of DSA (C)', 'Hotel Management System (Python)', 'BuzzerVerse game for IEEE']::text[], 'https://github.com/vkhushi1802', 'https://www.linkedin.com/in/khushi-verma-58553930a/', null, 'mentors/khushi.jpg', 5, 8, false, 4)
  on conflict (id) do update set name = excluded.name, tagline = excluded.tagline, highlights = excluded.highlights,
    github = excluded.github, linkedin = excluded.linkedin, accent = excluded.accent, photo_url = excluded.photo_url,
    active = excluded.active, sort = excluded.sort;  -- team sizes are NOT overwritten: they are edited on the admin page
insert into public.mentors (id, name, tagline, highlights, github, linkedin, accent, photo_url, min_team, max_team, active, sort) values
  ('aarjav', 'Aarjav Singh', 'Rust, Go & local-first AI tools', array['Wisteria (Rust, local voice dictation)', 'Imposter (Node.js, WebSockets)', 'DevMatrix CLI (Go, Cobra)', 'Very Useless Tokenizer (Python, BPE)']::text[], 'https://github.com/dev-rjav', 'https://www.linkedin.com/in/aarjav-singh-a72a19384', null, 'mentors/aarjav.jpg', 5, 8, false, 5)
  on conflict (id) do update set name = excluded.name, tagline = excluded.tagline, highlights = excluded.highlights,
    github = excluded.github, linkedin = excluded.linkedin, accent = excluded.accent, photo_url = excluded.photo_url,
    active = excluded.active, sort = excluded.sort;  -- team sizes are NOT overwritten: they are edited on the admin page
insert into public.mentors (id, name, tagline, highlights, github, linkedin, accent, photo_url, min_team, max_team, active, sort) values
  ('divyanshu', 'Divyanshu Gaur', 'Cloud, DevOps & Backend Engineer', array['Autonomous CI/CD (FastAPI, LangGraph)', 'Guardian AI (DDoS detection, LSTM)', 'Jenkins + Docker CI/CD pipeline', 'AWS Academy Graduate']::text[], 'https://github.com/DivKiller1', 'https://www.linkedin.com/in/divyanshu-gaur-4a78b71b7/', null, 'mentors/divyanshu.jpg', 5, 8, true, 6)
  on conflict (id) do update set name = excluded.name, tagline = excluded.tagline, highlights = excluded.highlights,
    github = excluded.github, linkedin = excluded.linkedin, accent = excluded.accent, photo_url = excluded.photo_url,
    active = excluded.active, sort = excluded.sort;  -- team sizes are NOT overwritten: they are edited on the admin page
insert into public.mentors (id, name, tagline, highlights, github, linkedin, accent, photo_url, min_team, max_team, active, sort) values
  ('manan', 'Manan Arora', 'Docker, Kubernetes & DevOps', array['Student Grade Management System (Flask, PostgreSQL, Docker)', 'Apache on Kubernetes', 'FastAPI + GitHub Actions to Docker Hub', 'Ansible with Docker containers']::text[], 'https://github.com/Manan-Ar', 'https://www.linkedin.com/in/manan1950', null, 'mentors/manan.jpg', 5, 8, true, 7)
  on conflict (id) do update set name = excluded.name, tagline = excluded.tagline, highlights = excluded.highlights,
    github = excluded.github, linkedin = excluded.linkedin, accent = excluded.accent, photo_url = excluded.photo_url,
    active = excluded.active, sort = excluded.sort;  -- team sizes are NOT overwritten: they are edited on the admin page
insert into public.mentors (id, name, tagline, highlights, github, linkedin, accent, photo_url, min_team, max_team, active, sort) values
  ('charvie', 'Charvie Ganjoo', 'Java, Spring Boot & AI for agriculture', array['HyperAGRI-Spectra.AI (crop disease detection)', 'CRUD app (Java Spring Boot)', 'LeetCode practice in Java', 'Microsoft Learn MLOps & GenAIOps labs']::text[], 'https://github.com/charviegganju', 'https://www.linkedin.com/in/charvieggaanju/', null, 'mentors/charvie.jpg', 5, 8, true, 8)
  on conflict (id) do update set name = excluded.name, tagline = excluded.tagline, highlights = excluded.highlights,
    github = excluded.github, linkedin = excluded.linkedin, accent = excluded.accent, photo_url = excluded.photo_url,
    active = excluded.active, sort = excluded.sort;  -- team sizes are NOT overwritten: they are edited on the admin page

-- questions
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('om1', 'om', 'skill', null, 'Om''s WhatsApp Group Adder automates the browser using which tool?', array['Selenium', 'Puppeteer', 'Playwright', 'Cypress']::text[], 0, 0)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('om2', 'om', 'skill', null, 'Where does Om''s CloudQuiz app store quiz data?', array['MongoDB Atlas', 'Firebase Firestore', 'MySQL', 'Supabase']::text[], 1, 1)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('om3', 'om', 'skill', null, 'Om''s Security Scanner checks a website for which three things?', array['CSRF, DDoS and phishing', 'Weak passwords, CORS and cookies', 'Open ports, SQL injection and XSS', 'SSL expiry, DNS and malware']::text[], 2, 2)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('om4', 'om', 'skill', null, 'Om''s Sleep-Timer desktop app is written in which language?', array['C++', 'Python', 'Java', 'C#']::text[], 3, 3)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('om5', 'om', 'skill', null, 'The backend of Om''s real-time chat app (APP repo) is built with?', array['Flask + MongoDB', 'Django + PostgreSQL', 'Express + MySQL', 'Spring Boot + Redis']::text[], 0, 4)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('om__project', 'om', 'interest', 'project', 'What kind of project do you most want to build?', array['A real product / startup-style app', 'A research / paper-style project', 'Open-source contributions', 'Hackathon / competition builds', 'Learn fundamentals with mini projects']::text[], null, 0)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('om__style', 'om', 'interest', 'style', 'How would you like your mentor to guide you?', array['Code alongside us, hands-on', 'Set the direction and review our work', 'Let us drive, help only when we''re stuck']::text[], null, 1)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('om__pace', 'om', 'interest', 'pace', 'How do you like to work?', array['Structured: fixed weekly goals and check-ins', 'Sprints: intense bursts around deadlines', 'Flexible: async, at my own pace']::text[], null, 2)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('om__value', 'om', 'interest', 'value', 'What is your biggest strength as a team member?', array['Consistency', 'Curiosity', 'Technical depth', 'Creativity', 'Communication']::text[], null, 3)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('om__meet', 'om', 'interest', 'meet', 'How would you prefer to meet your team?', array['In person on campus', 'Online calls (Meet / Discord)', 'Mostly chat (WhatsApp / Discord)']::text[], null, 4)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
update public.questions set active = false where mentor_id = 'om' and id not in ('om1', 'om2', 'om3', 'om4', 'om5', 'om__project', 'om__style', 'om__pace', 'om__value', 'om__meet');
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('ch1', 'chirrayu', 'skill', null, 'Chirrayu''s MovieTime keeps ''Watch Party'' viewers in sync using?', array['Firebase Realtime Database', 'Socket.io with Redis', 'GraphQL subscriptions', 'Polling a REST API']::text[], 1, 0)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('ch2', 'chirrayu', 'skill', null, 'WheelsOnRent lets students book scooters and bikes in which two areas?', array['Prem Nagar and Clement Town', 'Rajpur and Mussoorie', 'Bidholi and Kandoli', 'ISBT and Clock Tower']::text[], 2, 1)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('ch3', 'chirrayu', 'skill', null, 'In MovieTime''s recommendation score, which signal earns the most points per match?', array['Favourite genres', 'Watchlist genres', 'Watch history', 'TMDB rating']::text[], 0, 2)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('ch4', 'chirrayu', 'skill', null, 'Chirrayu''s problem-statement app (Flask) stores data in which database?', array['MongoDB', 'PostgreSQL', 'Firebase', 'MySQL']::text[], 3, 3)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('ch5', 'chirrayu', 'skill', null, 'The backend of Chirrayu''s UPES Complaint Management System uses?', array['Flask + MongoDB', 'Express + MySQL', 'Django + SQLite', 'Spring Boot + PostgreSQL']::text[], 0, 4)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('chirrayu__style', 'chirrayu', 'interest', 'style', 'How would you like your mentor to guide you?', array['Code alongside us, hands-on', 'Set the direction and review our work', 'Let us drive, help only when we''re stuck']::text[], null, 0)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('chirrayu__pace', 'chirrayu', 'interest', 'pace', 'How do you like to work?', array['Structured: fixed weekly goals and check-ins', 'Sprints: intense bursts around deadlines', 'Flexible: async, at my own pace']::text[], null, 1)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('chirrayu__value', 'chirrayu', 'interest', 'value', 'What is your biggest strength as a team member?', array['Consistency', 'Curiosity', 'Technical depth', 'Creativity', 'Communication']::text[], null, 2)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('chirrayu__meet', 'chirrayu', 'interest', 'meet', 'How would you prefer to meet your team?', array['In person on campus', 'Online calls (Meet / Discord)', 'Mostly chat (WhatsApp / Discord)']::text[], null, 3)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('chirrayu__time', 'chirrayu', 'interest', 'time', 'How much time can you give per week?', array['Under 2 hours', '2–4 hours', '4–6 hours', '6+ hours']::text[], null, 4)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
update public.questions set active = false where mentor_id = 'chirrayu' and id not in ('ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'chirrayu__style', 'chirrayu__pace', 'chirrayu__value', 'chirrayu__meet', 'chirrayu__time');
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('dh1', 'dhairya', 'skill', null, 'Dhairya''s GitHub profile says he did a full-stack internship at?', array['Redian Software', 'Infosys', 'TCS', 'Zoho']::text[], 0, 0)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('dh2', 'dhairya', 'skill', null, 'Dhairya''s URL shortener UrlNest stores links using?', array['Firebase', 'MySQL', 'AWS DynamoDB (via Lambda)', 'Redis']::text[], 2, 1)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('dh3', 'dhairya', 'skill', null, 'Which AI model family powers the chatbot in Dhairya''s CropCare app?', array['OpenAI GPT', 'Anthropic Claude', 'Meta Llama', 'Google Gemini']::text[], 3, 2)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('dh4', 'dhairya', 'skill', null, 'Dhairya''s AirGuard app gets air-pollution data from which API?', array['OpenWeatherMap', 'Google Maps', 'NASA Earthdata', 'AccuWeather']::text[], 0, 3)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('dh5', 'dhairya', 'skill', null, 'Dhairya describes himself on GitHub as a ___ stack developer.', array['MEAN', 'MERN', 'LAMP', 'Django']::text[], 1, 4)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('dhairya__pace', 'dhairya', 'interest', 'pace', 'How do you like to work?', array['Structured: fixed weekly goals and check-ins', 'Sprints: intense bursts around deadlines', 'Flexible: async, at my own pace']::text[], null, 0)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('dhairya__value', 'dhairya', 'interest', 'value', 'What is your biggest strength as a team member?', array['Consistency', 'Curiosity', 'Technical depth', 'Creativity', 'Communication']::text[], null, 1)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('dhairya__meet', 'dhairya', 'interest', 'meet', 'How would you prefer to meet your team?', array['In person on campus', 'Online calls (Meet / Discord)', 'Mostly chat (WhatsApp / Discord)']::text[], null, 2)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('dhairya__time', 'dhairya', 'interest', 'time', 'How much time can you give per week?', array['Under 2 hours', '2–4 hours', '4–6 hours', '6+ hours']::text[], null, 3)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('dhairya__project', 'dhairya', 'interest', 'project', 'What kind of project do you most want to build?', array['A real product / startup-style app', 'A research / paper-style project', 'Open-source contributions', 'Hackathon / competition builds', 'Learn fundamentals with mini projects']::text[], null, 4)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
update public.questions set active = false where mentor_id = 'dhairya' and id not in ('dh1', 'dh2', 'dh3', 'dh4', 'dh5', 'dhairya__pace', 'dhairya__value', 'dhairya__meet', 'dhairya__time', 'dhairya__project');
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('va1', 'vanshdeep', 'skill', null, 'Vanshdeep trained his Small Language Model (SLM) on which dataset?', array['Wikipedia', 'TinyStories', 'Shakespeare', 'OpenWebText']::text[], 1, 0)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('va2', 'vanshdeep', 'skill', null, 'His Object Monitoring System detects and tracks objects using?', array['Faster R-CNN + Kalman filter', 'SSD + optical flow', 'YOLOv8 + DeepSORT', 'Mask R-CNN + ByteTrack']::text[], 2, 1)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('va3', 'vanshdeep', 'skill', null, 'AlgoBench runs students'' submitted code safely using?', array['Judge0', 'AWS Lambda', 'Replit API', 'Piston']::text[], 0, 2)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('va4', 'vanshdeep', 'skill', null, 'Video consultations in his MediLink healthcare app are built on?', array['Zoom SDK', 'Agora', 'Twilio Video', 'WebRTC (with Jitsi fallback)']::text[], 3, 3)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('va5', 'vanshdeep', 'skill', null, 'In his HGNN-Model repo, what does HGNN stand for?', array['Hypergraph Neural Network', 'Hierarchical Graph Neural Network', 'Hybrid Gated Neural Network', 'Heterogeneous Graph Node Network']::text[], 0, 4)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('vanshdeep__value', 'vanshdeep', 'interest', 'value', 'What is your biggest strength as a team member?', array['Consistency', 'Curiosity', 'Technical depth', 'Creativity', 'Communication']::text[], null, 0)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('vanshdeep__meet', 'vanshdeep', 'interest', 'meet', 'How would you prefer to meet your team?', array['In person on campus', 'Online calls (Meet / Discord)', 'Mostly chat (WhatsApp / Discord)']::text[], null, 1)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('vanshdeep__time', 'vanshdeep', 'interest', 'time', 'How much time can you give per week?', array['Under 2 hours', '2–4 hours', '4–6 hours', '6+ hours']::text[], null, 2)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('vanshdeep__project', 'vanshdeep', 'interest', 'project', 'What kind of project do you most want to build?', array['A real product / startup-style app', 'A research / paper-style project', 'Open-source contributions', 'Hackathon / competition builds', 'Learn fundamentals with mini projects']::text[], null, 3)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('vanshdeep__style', 'vanshdeep', 'interest', 'style', 'How would you like your mentor to guide you?', array['Code alongside us, hands-on', 'Set the direction and review our work', 'Let us drive, help only when we''re stuck']::text[], null, 4)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
update public.questions set active = false where mentor_id = 'vanshdeep' and id not in ('va1', 'va2', 'va3', 'va4', 'va5', 'vanshdeep__value', 'vanshdeep__meet', 'vanshdeep__time', 'vanshdeep__project', 'vanshdeep__style');
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('kh1', 'khushi', 'skill', null, 'In Khushi''s 100 Days of DSA challenge, how many problems does she solve each day?', array['1', '2', '3', '5']::text[], 1, 0)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('kh2', 'khushi', 'skill', null, 'Which language does Khushi use for her DSA and coding challenges?', array['Python', 'Java', 'C', 'C++']::text[], 2, 1)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('kh3', 'khushi', 'skill', null, 'Her Python Hotel Management System saves its data in?', array['MySQL', 'SQLite', 'MongoDB', 'JSON files']::text[], 3, 2)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('kh4', 'khushi', 'skill', null, 'Khushi built the BuzzerVerse game for a workshop of which organisation?', array['IEEE', 'GDSC', 'ACM', 'CodeChef Chapter']::text[], 0, 3)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('kh5', 'khushi', 'skill', null, 'What is the motto at the top of Khushi''s 100 Days of DSA repo?', array['Code every day', 'Consistency over intensity', 'Practice makes perfect', 'Learn, build, repeat']::text[], 1, 4)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('khushi__meet', 'khushi', 'interest', 'meet', 'How would you prefer to meet your team?', array['In person on campus', 'Online calls (Meet / Discord)', 'Mostly chat (WhatsApp / Discord)']::text[], null, 0)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('khushi__time', 'khushi', 'interest', 'time', 'How much time can you give per week?', array['Under 2 hours', '2–4 hours', '4–6 hours', '6+ hours']::text[], null, 1)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('khushi__project', 'khushi', 'interest', 'project', 'What kind of project do you most want to build?', array['A real product / startup-style app', 'A research / paper-style project', 'Open-source contributions', 'Hackathon / competition builds', 'Learn fundamentals with mini projects']::text[], null, 2)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('khushi__style', 'khushi', 'interest', 'style', 'How would you like your mentor to guide you?', array['Code alongside us, hands-on', 'Set the direction and review our work', 'Let us drive, help only when we''re stuck']::text[], null, 3)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('khushi__pace', 'khushi', 'interest', 'pace', 'How do you like to work?', array['Structured: fixed weekly goals and check-ins', 'Sprints: intense bursts around deadlines', 'Flexible: async, at my own pace']::text[], null, 4)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
update public.questions set active = false where mentor_id = 'khushi' and id not in ('kh1', 'kh2', 'kh3', 'kh4', 'kh5', 'khushi__meet', 'khushi__time', 'khushi__project', 'khushi__style', 'khushi__pace');
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('aa1', 'aarjav', 'skill', null, 'In Aarjav''s Wisteria dictation app, where does the speech-to-text run?', array['On cloud GPUs', 'Locally on your own machine', 'Inside a browser extension', 'On Google''s Speech API']::text[], 1, 0)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('aa2', 'aarjav', 'skill', null, 'Which speech-to-text model is Wisteria''s default?', array['Amazon Transcribe', 'Mozilla DeepSpeech', 'Parakeet TDT 0.6B v3', 'Google Speech-to-Text']::text[], 2, 1)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('aa3', 'aarjav', 'skill', null, 'Aarjav''s Imposter party game connects the browser and the server using?', array['WebSockets', 'REST polling', 'GraphQL', 'Firebase Realtime Database']::text[], 0, 2)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('aa4', 'aarjav', 'skill', null, 'How many players can join one Imposter room?', array['2–4', '5–20', 'Unlimited', '3–10']::text[], 3, 3)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('aa5', 'aarjav', 'skill', null, 'Which tokenization technique did Aarjav build by hand in Very Useless Tokenizer?', array['Byte-Pair Encoding (BPE) merges', 'WordPiece', 'SentencePiece unigram', 'Character-only splitting']::text[], 0, 4)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('aarjav__time', 'aarjav', 'interest', 'time', 'How much time can you give per week?', array['Under 2 hours', '2–4 hours', '4–6 hours', '6+ hours']::text[], null, 0)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('aarjav__project', 'aarjav', 'interest', 'project', 'What kind of project do you most want to build?', array['A real product / startup-style app', 'A research / paper-style project', 'Open-source contributions', 'Hackathon / competition builds', 'Learn fundamentals with mini projects']::text[], null, 1)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('aarjav__style', 'aarjav', 'interest', 'style', 'How would you like your mentor to guide you?', array['Code alongside us, hands-on', 'Set the direction and review our work', 'Let us drive, help only when we''re stuck']::text[], null, 2)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('aarjav__pace', 'aarjav', 'interest', 'pace', 'How do you like to work?', array['Structured: fixed weekly goals and check-ins', 'Sprints: intense bursts around deadlines', 'Flexible: async, at my own pace']::text[], null, 3)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('aarjav__value', 'aarjav', 'interest', 'value', 'What is your biggest strength as a team member?', array['Consistency', 'Curiosity', 'Technical depth', 'Creativity', 'Communication']::text[], null, 4)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
update public.questions set active = false where mentor_id = 'aarjav' and id not in ('aa1', 'aa2', 'aa3', 'aa4', 'aa5', 'aarjav__time', 'aarjav__project', 'aarjav__style', 'aarjav__pace', 'aarjav__value');
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('dg1', 'divyanshu', 'skill', null, 'Divyanshu''s my-app CI/CD pipeline runs on which automation server?', array['GitHub Actions', 'Jenkins', 'CircleCI', 'Travis CI']::text[], 1, 0)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('dg2', 'divyanshu', 'skill', null, 'In his Rock-Paper-Scissor game, what win streak gets you into the Hall of Fame?', array['1', '5', '3', '10']::text[], 2, 1)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('dg3', 'divyanshu', 'skill', null, 'His Guardian AI DDoS system predicts short-term risk with which model?', array['LSTM', 'Random Forest', 'CNN', 'Transformer']::text[], 0, 2)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('dg4', 'divyanshu', 'skill', null, 'Which LLM provider powers his Autonomous CI/CD vulnerability-fix platform?', array['OpenAI GPT-4', 'Google Gemini', 'Anthropic Claude', 'Groq (Llama 3.1)']::text[], 3, 3)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('dg5', 'divyanshu', 'skill', null, 'What is Divyanshu''s B.Tech specialisation at UPES?', array['AI & Machine Learning', 'Cloud Computing & Virtualization', 'Cybersecurity', 'Data Science']::text[], 1, 4)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('divyanshu__project', 'divyanshu', 'interest', 'project', 'What kind of project do you most want to build?', array['A real product / startup-style app', 'A research / paper-style project', 'Open-source contributions', 'Hackathon / competition builds', 'Learn fundamentals with mini projects']::text[], null, 0)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('divyanshu__style', 'divyanshu', 'interest', 'style', 'How would you like your mentor to guide you?', array['Code alongside us, hands-on', 'Set the direction and review our work', 'Let us drive, help only when we''re stuck']::text[], null, 1)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('divyanshu__pace', 'divyanshu', 'interest', 'pace', 'How do you like to work?', array['Structured: fixed weekly goals and check-ins', 'Sprints: intense bursts around deadlines', 'Flexible: async, at my own pace']::text[], null, 2)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('divyanshu__value', 'divyanshu', 'interest', 'value', 'What is your biggest strength as a team member?', array['Consistency', 'Curiosity', 'Technical depth', 'Creativity', 'Communication']::text[], null, 3)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('divyanshu__meet', 'divyanshu', 'interest', 'meet', 'How would you prefer to meet your team?', array['In person on campus', 'Online calls (Meet / Discord)', 'Mostly chat (WhatsApp / Discord)']::text[], null, 4)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
update public.questions set active = false where mentor_id = 'divyanshu' and id not in ('dg1', 'dg2', 'dg3', 'dg4', 'dg5', 'divyanshu__project', 'divyanshu__style', 'divyanshu__pace', 'divyanshu__value', 'divyanshu__meet');
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('mn1', 'manan', 'skill', null, 'Manan''s Student Grade Management System is built with which stack?', array['Flask + PostgreSQL', 'FastAPI + MongoDB', 'Django + MySQL', 'Express + PostgreSQL']::text[], 0, 0)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('mn2', 'manan', 'skill', null, 'In that project, how does the Flask API wait until the database is ready?', array['It retries the connection in a loop', 'A fixed sleep before starting', 'A PostgreSQL health check (pg_isready) in Docker Compose', 'A Kubernetes readiness probe']::text[], 2, 1)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('mn3', 'manan', 'skill', null, 'In his apache-k8s project, which Kubernetes Service type exposes the Apache site?', array['ClusterIP', 'LoadBalancer', 'NodePort', 'ExternalName']::text[], 2, 2)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('mn4', 'manan', 'skill', null, 'In apache-k8s, where does the web page (index.html) served by Apache come from?', array['A ConfigMap mounted into the pod', 'A PersistentVolume', 'A Secret', 'It is baked into the image']::text[], 0, 3)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('mn5', 'manan', 'skill', null, 'What does the GitHub Actions workflow in his fastapi-app repo do on a push to main?', array['Runs pytest', 'Deploys to AWS', 'Publishes to PyPI', 'Builds and pushes a Docker image to Docker Hub']::text[], 3, 4)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('manan__style', 'manan', 'interest', 'style', 'How would you like your mentor to guide you?', array['Code alongside us, hands-on', 'Set the direction and review our work', 'Let us drive, help only when we''re stuck']::text[], null, 0)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('manan__pace', 'manan', 'interest', 'pace', 'How do you like to work?', array['Structured: fixed weekly goals and check-ins', 'Sprints: intense bursts around deadlines', 'Flexible: async, at my own pace']::text[], null, 1)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('manan__value', 'manan', 'interest', 'value', 'What is your biggest strength as a team member?', array['Consistency', 'Curiosity', 'Technical depth', 'Creativity', 'Communication']::text[], null, 2)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('manan__meet', 'manan', 'interest', 'meet', 'How would you prefer to meet your team?', array['In person on campus', 'Online calls (Meet / Discord)', 'Mostly chat (WhatsApp / Discord)']::text[], null, 3)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('manan__time', 'manan', 'interest', 'time', 'How much time can you give per week?', array['Under 2 hours', '2–4 hours', '4–6 hours', '6+ hours']::text[], null, 4)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
update public.questions set active = false where mentor_id = 'manan' and id not in ('mn1', 'mn2', 'mn3', 'mn4', 'mn5', 'manan__style', 'manan__pace', 'manan__value', 'manan__meet', 'manan__time');
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('cg1', 'charvie', 'skill', null, 'Which language does Charvie use for her LeetCode practice?', array['Python', 'C++', 'Java', 'JavaScript']::text[], 2, 0)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('cg2', 'charvie', 'skill', null, 'Her HyperAGRI-Spectra.AI project detects crop disease using?', array['Satellite RGB photos', 'Hyperspectral imaging + IoT', 'Drone thermal cameras', 'Soil pH sensors only']::text[], 1, 1)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('cg3', 'charvie', 'skill', null, 'Charvie''s CRUD_App is built with which framework?', array['Node.js + Express', 'Django', 'Java Spring Boot', 'Laravel']::text[], 2, 2)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('cg4', 'charvie', 'skill', null, 'Her LeetCode 53 (Maximum Subarray) solution uses which approach?', array['Kadane''s algorithm (running sum)', 'Divide and conquer', 'Brute force over all subarrays', 'Binary search']::text[], 0, 3)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('cg5', 'charvie', 'skill', null, 'In her LeetCode 136 (Single Number) solution, how is the single number found?', array['Sorting the array', 'Using a HashMap of counts', 'Sum of set minus sum of array', 'XOR of all the numbers']::text[], 3, 4)
  on conflict (id) do update set mentor_id = excluded.mentor_id, kind = excluded.kind, qkey = null, prompt = excluded.prompt,
    options = excluded.options, correct = excluded.correct, position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('charvie__pace', 'charvie', 'interest', 'pace', 'How do you like to work?', array['Structured: fixed weekly goals and check-ins', 'Sprints: intense bursts around deadlines', 'Flexible: async, at my own pace']::text[], null, 0)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('charvie__value', 'charvie', 'interest', 'value', 'What is your biggest strength as a team member?', array['Consistency', 'Curiosity', 'Technical depth', 'Creativity', 'Communication']::text[], null, 1)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('charvie__meet', 'charvie', 'interest', 'meet', 'How would you prefer to meet your team?', array['In person on campus', 'Online calls (Meet / Discord)', 'Mostly chat (WhatsApp / Discord)']::text[], null, 2)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('charvie__time', 'charvie', 'interest', 'time', 'How much time can you give per week?', array['Under 2 hours', '2–4 hours', '4–6 hours', '6+ hours']::text[], null, 3)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
insert into public.questions (id, mentor_id, kind, qkey, prompt, options, correct, position) values
  ('charvie__project', 'charvie', 'interest', 'project', 'What kind of project do you most want to build?', array['A real product / startup-style app', 'A research / paper-style project', 'Open-source contributions', 'Hackathon / competition builds', 'Learn fundamentals with mini projects']::text[], null, 4)
  on conflict (id) do update set qkey = excluded.qkey, prompt = excluded.prompt, options = excluded.options,
    position = excluded.position, active = true;
update public.questions set active = false where mentor_id = 'charvie' and id not in ('cg1', 'cg2', 'cg3', 'cg4', 'cg5', 'charvie__pace', 'charvie__value', 'charvie__meet', 'charvie__time', 'charvie__project');

commit;

-- ── Set the admin password (uncomment, change, run once) ──
-- update public.settings set admin_hash = extensions.crypt('CHANGE-ME', extensions.gen_salt('bf')) where id = 1;
