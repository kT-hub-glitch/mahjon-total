-- Supabase Dashboard > SQL Editor で一度だけ実行してください。
-- 管理画面のログイン用メールは admin@mahjong.local を使用します。

alter table public.participants
  add column if not exists can_score boolean not null default false,
  add column if not exists active boolean not null default true,
  add column if not exists is_guest boolean not null default false,
  add column if not exists fixed_table text,
  add column if not exists guest_table_preference text,
  add column if not exists avoid_player_id uuid references public.participants(id) on delete set null,
  add column if not exists avoid_player_id_2 uuid references public.participants(id) on delete set null,
  add column if not exists avoid_player_id_3 uuid references public.participants(id) on delete set null,
  add column if not exists team_code text check (team_code in ('A', 'B')),
  add column if not exists sort_order integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'participants_fixed_table_check'
  ) then
    alter table public.participants
      add constraint participants_fixed_table_check
      check (fixed_table is null or fixed_table ~ '^[A-Z]$');
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'participants_guest_preference_check'
  ) then
    alter table public.participants
      add constraint participants_guest_preference_check
      check (guest_table_preference is null or guest_table_preference ~ '^[A-Z]$');
  end if;
end $$;

with roster(name, sort_order) as (
  values
    ('雛呑ちの', 1), ('猫又めいど', 2), ('こみなと', 3), ('あおいしもん', 4),
    ('AXZ', 5), ('一期一会', 6), ('天然芝w', 7), ('鉄雑魚さん', 8),
    ('山さん', 9), ('せれん', 10), ('きくりん', 11), ('ベリ', 12),
    ('コータ', 13), ('なちぽ', 14), ('ひょ', 15), ('検察側の証人', 16),
    ('ぐでかご@VPL', 17), ('サンピン', 18), ('ムック08', 19), ('草原', 20),
    ('のりごはん', 21), ('ガル', 22), ('confetti', 23), ('シャオロン', 24),
    ('ぴっぴ', 25), ('たんたん', 26), ('るいるい', 27), ('かのっち☆', 28),
    ('しぐしぐ', 29), ('スピナシア', 30), ('茶慈 庵', 31), ('いたう', 32),
    ('あわ', 33), ('初心者の無銘', 34), ('とり', 35), ('まっちゃん', 36),
    ('うしんた', 37), ('すりぴ', 38), ('ハットリン', 39), ('よっぴー', 40)
)
update public.participants p
set sort_order = roster.sort_order,
    active = true
from roster
where p.name = roster.name;

-- 過去の交代前選手は成績データを残し、今回の参加者一覧からのみ外します。
update public.participants
set active = false
where name in ('ちぃーちぃー', 'なぽ', '星屑マル', 'ドラどらごん');

update public.participants
set can_score = name in (
  '雛呑ちの', 'あおいしもん', '一期一会', 'せれん', 'コータ', 'ひょ',
  'ぐでかご@VPL', 'サンピン', 'ガル', 'シャオロン', 'ぴっぴ', 'るいるい',
  'かのっち☆', 'いたう', 'うしんた'
);

update public.participants
set is_guest = name in ('雛呑ちの', '猫又めいど'),
    fixed_table = case
      when name = '雛呑ちの' then 'E'
      when name = '猫又めいど' then 'J'
      else fixed_table
    end,
    guest_table_preference = case
      when name = 'ムック08' then (
        select id::text
        from public.participants
        where name = '猫又めいど'
        limit 1
      )
      else guest_table_preference
    end;

create table if not exists public.schedule_assignments (
  round_number smallint not null check (round_number between 1 and 20),
  table_name text not null check (table_name ~ '^[A-Z]$'),
  seat_number smallint not null check (seat_number between 1 and 4),
  participant_id uuid not null references public.participants(id) on delete restrict,
  updated_at timestamptz not null default now(),
  primary key (round_number, table_name, seat_number),
  unique (round_number, participant_id)
);

create table if not exists public.tournament_settings (
  id smallint primary key check (id = 1),
  team_enabled boolean not null default false,
  team_a_name text not null default 'チーム1',
  team_b_name text not null default 'チーム2',
  ranking_public boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.tournament_settings
  add column if not exists ranking_public boolean not null default true;

insert into public.tournament_settings (id)
values (1)
on conflict (id) do nothing;

create or replace function public.is_tournament_admin()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'admin@mahjong.local';
$$;

alter table public.participants enable row level security;
alter table public.schedule_assignments enable row level security;
alter table public.tournament_settings enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('participants', 'schedule_assignments', 'tournament_settings')
  loop
    execute format('drop policy if exists %I on public.%I', policy_record.policyname, policy_record.tablename);
  end loop;
end $$;

create policy "participants_public_read"
on public.participants for select
to anon, authenticated
using (true);

create policy "participants_admin_insert"
on public.participants for insert
to authenticated
with check (public.is_tournament_admin());

create policy "participants_admin_update"
on public.participants for update
to authenticated
using (public.is_tournament_admin())
with check (public.is_tournament_admin());

create policy "participants_admin_delete"
on public.participants for delete
to authenticated
using (public.is_tournament_admin());

create policy "schedule_public_read"
on public.schedule_assignments for select
to anon, authenticated
using (true);

create policy "schedule_admin_insert"
on public.schedule_assignments for insert
to authenticated
with check (public.is_tournament_admin());

create policy "schedule_admin_update"
on public.schedule_assignments for update
to authenticated
using (public.is_tournament_admin())
with check (public.is_tournament_admin());

create policy "schedule_admin_delete"
on public.schedule_assignments for delete
to authenticated
using (public.is_tournament_admin());

create policy "settings_public_read"
on public.tournament_settings for select
to anon, authenticated
using (true);

create policy "settings_admin_insert"
on public.tournament_settings for insert
to authenticated
with check (public.is_tournament_admin());

create policy "settings_admin_update"
on public.tournament_settings for update
to authenticated
using (public.is_tournament_admin())
with check (public.is_tournament_admin());

revoke insert, update, delete on public.participants from anon;
revoke insert, update, delete on public.schedule_assignments from anon;
revoke insert, update, delete on public.tournament_settings from anon;
grant select on public.participants to anon, authenticated;
grant select, insert, update, delete on public.participants to authenticated;
grant select on public.schedule_assignments to anon, authenticated;
grant select, insert, update, delete on public.schedule_assignments to authenticated;
grant select on public.tournament_settings to anon, authenticated;
grant select, insert, update on public.tournament_settings to authenticated;

create or replace function public.replace_tournament_schedule(assignments jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_tournament_admin() then
    raise exception 'administrator access required';
  end if;

  if jsonb_typeof(assignments) <> 'array' then
    raise exception 'assignments must be an array';
  end if;

  delete from public.schedule_assignments;

  insert into public.schedule_assignments (
    round_number,
    table_name,
    seat_number,
    participant_id,
    updated_at
  )
  select
    (item ->> 'round_number')::smallint,
    item ->> 'table_name',
    (item ->> 'seat_number')::smallint,
    (item ->> 'participant_id')::uuid,
    now()
  from jsonb_array_elements(assignments) as item;
end;
$$;

revoke all on function public.replace_tournament_schedule(jsonb) from public, anon;
grant execute on function public.replace_tournament_schedule(jsonb) to authenticated;

notify pgrst, 'reload schema';
