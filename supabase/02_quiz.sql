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
