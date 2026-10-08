-- looot-local-leads schema. Every table has row level security: a user reads and writes only rows
-- where owner_id = auth.uid().

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  query text not null check (char_length(query) between 1 and 200),
  location text not null check (char_length(location) between 1 and 200),
  pages_fetched int not null default 0,
  created_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  place_key text not null,
  name text not null,
  category text,
  address text,
  phone text,
  website text,
  rating numeric(2, 1),
  reviews int,
  maps_url text,
  gaps text[] not null default '{}',
  score int not null default 0,
  email text,
  email_source text,
  email_status text check (email_status in ('valid', 'catch_all', 'risky', 'invalid', 'unknown')),
  audited_at timestamptz,
  status text not null default 'new' check (status in ('new', 'contacted', 'replied', 'won', 'lost', 'skip')),
  notes text,
  created_at timestamptz not null default now(),
  unique (campaign_id, place_key)
);

create table public.step_runs (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  step text not null check (step in ('search', 'audit', 'verify')),
  runs int not null default 0,
  changed int not null default 0,
  estimate_usd numeric(12, 6) not null default 0,
  max_cost_usd numeric(12, 6) not null default 0,
  spent_usd numeric(12, 6) not null default 0,
  stopped_for_budget boolean not null default false,
  errors text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index campaigns_owner_idx on public.campaigns (owner_id, created_at desc);
create index leads_campaign_score_idx on public.leads (campaign_id, score desc);
create index leads_owner_idx on public.leads (owner_id);
create index step_runs_campaign_idx on public.step_runs (campaign_id, created_at desc);

alter table public.campaigns enable row level security;
alter table public.leads enable row level security;
alter table public.step_runs enable row level security;

create policy campaigns_select on public.campaigns for select to authenticated using (owner_id = (select auth.uid()));
create policy campaigns_insert on public.campaigns for insert to authenticated with check (owner_id = (select auth.uid()));
create policy campaigns_update on public.campaigns for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy campaigns_delete on public.campaigns for delete to authenticated using (owner_id = (select auth.uid()));

-- A lead must also point at a campaign the user owns.
create policy leads_select on public.leads for select to authenticated using (owner_id = (select auth.uid()));
create policy leads_insert on public.leads for insert to authenticated with check (
  owner_id = (select auth.uid()) and exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = (select auth.uid()))
);
create policy leads_update on public.leads for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy leads_delete on public.leads for delete to authenticated using (owner_id = (select auth.uid()));

create policy step_runs_select on public.step_runs for select to authenticated using (owner_id = (select auth.uid()));
create policy step_runs_insert on public.step_runs for insert to authenticated with check (owner_id = (select auth.uid()));
create policy step_runs_delete on public.step_runs for delete to authenticated using (owner_id = (select auth.uid()));
