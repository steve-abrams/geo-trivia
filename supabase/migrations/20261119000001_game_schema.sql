-- Geo Trivia: rooms, players, questions, answers + game RPCs.
-- Players are Supabase anonymous users; every write goes through a security definer RPC.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ─── Tables ──────────────────────────────────────────────────────────────────

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z]{4}$'),
  host_id uuid not null, -- auth.uid() of the host
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  -- { difficulty, rounds: [{type, area}], questionsPerRound, timeLimit }
  settings jsonb not null,
  current_round int not null default 0,
  current_q int not null default 0,
  phase text check (phase in ('question', 'reveal', 'round_end', 'finished')),
  phase_started_at timestamptz, -- for 'question': when answering opens (after the map intro)
  phase_ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null,
  name text not null check (char_length(name) between 1 and 16),
  avatar text not null check (char_length(avatar) between 1 and 16),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  score int not null default 0,
  answered_question_id uuid, -- latest question this player has answered
  joined_at timestamptz not null default now(),
  unique (room_id, user_id)
);
create index players_user_id_idx on public.players (user_id);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  round int not null,
  idx int not null,
  type text not null check (type in ('country', 'state', 'flag', 'capital')),
  target_id text not null,
  options jsonb not null, -- [{id, label}]
  answer_id text not null,
  unique (room_id, round, idx)
);

create table public.answers (
  question_id uuid not null references public.questions (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  choice text not null,
  answered_at timestamptz not null default clock_timestamp(),
  ms int not null, -- time taken since answering opened
  is_correct boolean not null,
  points int not null default 0,
  primary key (question_id, player_id)
);
create index answers_player_id_idx on public.answers (player_id);
create index answers_room_id_idx on public.answers (room_id);

-- ─── Row level security (read-only for clients) ─────────────────────────────

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.questions enable row level security;
alter table public.answers enable row level security;

revoke all on public.rooms, public.players, public.questions, public.answers from anon, authenticated;
grant select on public.rooms, public.players, public.questions, public.answers to authenticated;

-- Security definer so policies on players don't recurse into themselves.
create function private.is_member(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.players where room_id = p_room and user_id = (select auth.uid()));
$$;

create policy "members read their room" on public.rooms
  for select to authenticated using ((select private.is_member(id)));

create policy "members read players" on public.players
  for select to authenticated using ((select private.is_member(room_id)));

-- Only questions that have been shown so far (no peeking ahead).
create policy "members read shown questions" on public.questions
  for select to authenticated using (
    (select private.is_member(room_id))
    and exists (
      select 1 from public.rooms r
      where r.id = room_id and r.status <> 'lobby'
        and (round < r.current_round or (round = r.current_round and idx <= r.current_q))
    )
  );

-- Your own answers any time; everyone's once the question is no longer open.
create policy "members read answers" on public.answers
  for select to authenticated using (
    exists (select 1 from public.players p where p.id = player_id and p.user_id = (select auth.uid()))
    or (
      (select private.is_member(room_id))
      and not exists (
        select 1 from public.rooms r join public.questions q on q.room_id = r.id
        where r.id = room_id and q.id = question_id
          and r.phase = 'question' and q.round = r.current_round and q.idx = r.current_q
      )
    )
  );

grant usage on schema private to authenticated;
grant execute on function private.is_member(uuid) to authenticated;

-- ─── Helpers ─────────────────────────────────────────────────────────────────

create function private.option_count(p_difficulty text)
returns int language sql immutable set search_path = '' as $$
  select case p_difficulty when 'easy' then 3 when 'medium' then 5 when 'hard' then 7 end;
$$;

-- Seconds of map intro before answering opens (world maps zoom in).
create function private.lead_seconds(p_type text)
returns numeric language sql immutable set search_path = '' as $$
  select case when p_type in ('country', 'capital') then 2.0 else 0.5 end;
$$;

create function private.validate_settings(s jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare
  r jsonb;
begin
  if jsonb_typeof(s) <> 'object' then raise exception 'settings must be an object'; end if;
  if private.option_count(s ->> 'difficulty') is null then raise exception 'bad difficulty'; end if;
  if jsonb_typeof(s -> 'rounds') is distinct from 'array' or jsonb_array_length(s -> 'rounds') not between 1 and 4 then
    raise exception 'a game has 1-4 rounds';
  end if;
  for r in select * from jsonb_array_elements(s -> 'rounds') loop
    if coalesce(r ->> 'type', '') not in ('country', 'state', 'flag', 'capital') then raise exception 'bad round type'; end if;
    if coalesce(r ->> 'area', '') not in ('World', 'Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania') then
      raise exception 'bad round area';
    end if;
  end loop;
  if coalesce((s ->> 'questionsPerRound')::int, 0) not between 3 and 15 then raise exception 'questionsPerRound must be 3-15'; end if;
  if coalesce((s ->> 'timeLimit')::int, 0) not between 5 and 60 then raise exception 'timeLimit must be 5-60 seconds'; end if;
end;
$$;

create function private.new_code()
returns text language plpgsql volatile set search_path = '' as $$
declare
  -- No vowels, so codes can't spell words.
  alphabet constant text := 'BCDFGHJKLMNPQRSTVWXZ';
  c text;
begin
  loop
    c := '';
    for i in 1..4 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.rooms where code = c);
  end loop;
  return c;
end;
$$;

-- Open question (round, idx) for answering.
create function private.open_question(p_room public.rooms, p_round int, p_idx int)
returns void language plpgsql set search_path = '' as $$
declare
  q_type text;
  opens timestamptz;
begin
  select type into q_type from public.questions where room_id = p_room.id and round = p_round and idx = p_idx;
  opens := clock_timestamp() + make_interval(secs => private.lead_seconds(q_type));
  update public.rooms set
    current_round = p_round,
    current_q = p_idx,
    phase = 'question',
    phase_started_at = opens,
    phase_ends_at = opens + make_interval(secs => (p_room.settings ->> 'timeLimit')::int)
  where id = p_room.id;
end;
$$;

-- Score the current question: 10 for correct, +5 for the fastest when 2+ players got it right.
create function private.score_question(p_room public.rooms)
returns void language plpgsql set search_path = '' as $$
declare
  q_id uuid;
  n_correct int;
begin
  select id into q_id from public.questions
  where room_id = p_room.id and round = p_room.current_round and idx = p_room.current_q;

  update public.answers set points = 10 where question_id = q_id and is_correct;
  select count(*) into n_correct from public.answers where question_id = q_id and is_correct;
  if n_correct >= 2 then
    update public.answers set points = points + 5
    where question_id = q_id and is_correct
      and (ms, answered_at) = (select ms, answered_at from public.answers where question_id = q_id and is_correct order by ms, answered_at limit 1);
  end if;

  update public.players p set score = p.score + a.points
  from public.answers a where a.question_id = q_id and a.player_id = p.id and a.points > 0;
end;
$$;

-- Move a room to its next phase. Caller must hold the row lock.
create function private.advance(p_room_id uuid)
returns void language plpgsql set search_path = '' as $$
declare
  r public.rooms;
  n_rounds int;
  per_round int;
begin
  select * into r from public.rooms where id = p_room_id;
  n_rounds := jsonb_array_length(r.settings -> 'rounds');
  per_round := (r.settings ->> 'questionsPerRound')::int;

  if r.phase = 'question' then
    perform private.score_question(r);
    update public.rooms set phase = 'reveal', phase_started_at = clock_timestamp(),
      phase_ends_at = clock_timestamp() + interval '5 seconds' where id = r.id;
  elsif r.phase = 'reveal' then
    if r.current_q + 1 < per_round then
      perform private.open_question(r, r.current_round, r.current_q + 1);
    else
      update public.rooms set phase = 'round_end', phase_started_at = clock_timestamp(),
        phase_ends_at = clock_timestamp() + interval '8 seconds' where id = r.id;
    end if;
  elsif r.phase = 'round_end' then
    if r.current_round + 1 < n_rounds then
      perform private.open_question(r, r.current_round + 1, 0);
    else
      update public.rooms set status = 'finished', phase = 'finished', phase_started_at = clock_timestamp(),
        phase_ends_at = null where id = r.id;
    end if;
  end if;
end;
$$;

-- ─── Public RPCs ─────────────────────────────────────────────────────────────

create function public.server_now()
returns timestamptz language sql volatile set search_path = '' as $$ select clock_timestamp(); $$;

create function public.create_room(p_settings jsonb, p_name text, p_avatar text, p_color text)
returns json language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  room public.rooms;
  player_id uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  perform private.validate_settings(p_settings);
  if (select count(*) from public.rooms where host_id = uid and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'too many rooms, try again later';
  end if;
  insert into public.rooms (code, host_id, settings) values (private.new_code(), uid, p_settings) returning * into room;
  insert into public.players (room_id, user_id, name, avatar, color)
    values (room.id, uid, btrim(p_name), p_avatar, p_color) returning id into player_id;
  return json_build_object('room_id', room.id, 'code', room.code, 'player_id', player_id);
end;
$$;

create function public.join_room(p_code text, p_name text, p_avatar text, p_color text)
returns json language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  room public.rooms;
  pid uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into room from public.rooms where code = upper(btrim(p_code)) for update;
  if not found then raise exception 'room not found'; end if;

  select id into pid from public.players where room_id = room.id and user_id = uid;
  if pid is not null then
    -- Rejoining (e.g. after a refresh): allowed in any state; update the look in the lobby.
    if room.status = 'lobby' then
      update public.players set name = btrim(p_name), avatar = p_avatar, color = p_color where id = pid;
    end if;
  else
    if room.status <> 'lobby' then raise exception 'game already started'; end if;
    if (select count(*) from public.players where room_id = room.id) >= 10 then raise exception 'room is full'; end if;
    insert into public.players (room_id, user_id, name, avatar, color)
      values (room.id, uid, btrim(p_name), p_avatar, p_color) returning id into pid;
  end if;
  return json_build_object('room_id', room.id, 'code', room.code, 'player_id', pid);
end;
$$;

-- Host starts the game with questions generated on their device.
-- p_questions: [{round, idx, type, targetId, options: [{id, label}], answerId}]
create function public.start_game(p_room_id uuid, p_questions jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  room public.rooms;
  per_round int;
  n_opts int;
  q jsonb;
begin
  select * into room from public.rooms where id = p_room_id for update;
  if not found or room.host_id <> auth.uid() then raise exception 'only the host can start'; end if;
  if room.status <> 'lobby' then raise exception 'game already started'; end if;

  per_round := (room.settings ->> 'questionsPerRound')::int;
  n_opts := private.option_count(room.settings ->> 'difficulty');
  if jsonb_typeof(p_questions) <> 'array'
     or jsonb_array_length(p_questions) <> per_round * jsonb_array_length(room.settings -> 'rounds') then
    raise exception 'wrong number of questions';
  end if;

  for q in select * from jsonb_array_elements(p_questions) loop
    if coalesce((q ->> 'idx')::int not between 0 and per_round - 1
       or q ->> 'type' is distinct from room.settings -> 'rounds' -> (q ->> 'round')::int ->> 'type'
       or jsonb_array_length(q -> 'options') <> n_opts
       or not (q -> 'options') @> jsonb_build_array(jsonb_build_object('id', q ->> 'answerId'))
       or q ->> 'targetId' is distinct from q ->> 'answerId', true) then
      raise exception 'invalid question %', q;
    end if;
    insert into public.questions (room_id, round, idx, type, target_id, options, answer_id)
    values (room.id, (q ->> 'round')::int, (q ->> 'idx')::int, q ->> 'type', q ->> 'targetId', q -> 'options', q ->> 'answerId');
  end loop;

  update public.rooms set status = 'playing' where id = room.id;
  select * into room from public.rooms where id = room.id;
  perform private.open_question(room, 0, 0);
end;
$$;

create function public.submit_answer(p_question_id uuid, p_choice text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  q public.questions;
  room public.rooms;
  pid uuid;
  now_ts timestamptz := clock_timestamp();
begin
  select * into q from public.questions where id = p_question_id;
  if not found then raise exception 'question not found'; end if;
  select * into room from public.rooms where id = q.room_id for update;
  select id into pid from public.players where room_id = room.id and user_id = auth.uid();
  if pid is null then raise exception 'not in this room'; end if;

  if room.phase is distinct from 'question' or room.current_round <> q.round or room.current_q <> q.idx then
    raise exception 'question is not open';
  end if;
  if now_ts > room.phase_ends_at + interval '500 milliseconds' then raise exception 'too late'; end if;
  if not (q.options @> jsonb_build_array(jsonb_build_object('id', p_choice))) then raise exception 'not an option'; end if;

  insert into public.answers (question_id, player_id, room_id, choice, answered_at, ms, is_correct)
  values (q.id, pid, room.id, p_choice, now_ts,
          greatest(0, (extract(epoch from now_ts - room.phase_started_at) * 1000)::int), p_choice = q.answer_id)
  on conflict (question_id, player_id) do nothing;
  if not found then raise exception 'already answered'; end if;
  update public.players set answered_question_id = q.id where id = pid;

  -- Everyone answered? Reveal right away.
  if not exists (
    select 1 from public.players p
    where p.room_id = room.id and not exists (select 1 from public.answers a where a.question_id = q.id and a.player_id = p.id)
  ) then
    perform private.advance(room.id);
  end if;
end;
$$;

-- Any player may call this; it advances the room once the current phase has ended.
create function public.tick(p_room_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  room public.rooms;
begin
  if not private.is_member(p_room_id) then raise exception 'not in this room'; end if;
  select * into room from public.rooms where id = p_room_id for update;
  if room.status = 'playing' and room.phase_ends_at <= clock_timestamp() then
    perform private.advance(room.id);
  end if;
end;
$$;

-- Host skips the reveal / round summary.
create function public.skip_phase(p_room_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  room public.rooms;
begin
  select * into room from public.rooms where id = p_room_id for update;
  if not found or room.host_id <> auth.uid() then raise exception 'only the host can skip'; end if;
  if room.phase in ('reveal', 'round_end') then perform private.advance(room.id); end if;
end;
$$;

create function public.leave_room(p_room_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.players where room_id = p_room_id and user_id = auth.uid();
end;
$$;

revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function
  public.server_now(),
  public.create_room(jsonb, text, text, text),
  public.join_room(text, text, text, text),
  public.start_game(uuid, jsonb),
  public.submit_answer(uuid, text),
  public.tick(uuid),
  public.skip_phase(uuid),
  public.leave_room(uuid)
to authenticated;

-- ─── Realtime ────────────────────────────────────────────────────────────────

alter publication supabase_realtime add table public.rooms, public.players;

-- ─── Cleanup: old rooms and anonymous users ─────────────────────────────────

create extension if not exists pg_cron;

create function private.cleanup()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.rooms where created_at < now() - interval '1 day';
  delete from auth.users u
  where u.is_anonymous and u.created_at < now() - interval '7 days'
    and not exists (select 1 from public.players p where p.user_id = u.id);
end;
$$;

select cron.schedule('geo-trivia-cleanup', '17 4 * * *', 'select private.cleanup()');
