-- AI usage ledger — Supabase schema
--
-- Run this once against the `anatom3d` Supabase project (id `uafyfwyyqzunabpuftue`)
-- via the SQL editor in the dashboard. Idempotent so re-running is safe.
--
-- NOTE (2026-05): the app moved from a purchasable credit balance to a flat
-- DAILY TOKEN BUDGET (see CLAUDE.md, "Auth + daily AI usage"). This table is
-- now reused as a *usage log*: the server (api/_gate.ts) writes one
-- `consumption` row per AI call with `delta = -<real Anthropic tokens>`, and
-- "used today" = sum(-delta) since UTC midnight. The `purchase`/`signup_grant`
-- kinds, the `package_id`/`price_eur` columns, the `users.credits` column and
-- the `consume_tokens` RPC below are LEGACY/unused — left in place (harmless),
-- so no migration is needed and no new columns are required for the budget.
--
-- Mirrors the permissive RLS posture used by `public.users` — fine for the
-- hackathon trust model, NOT fine for production.

-- 1. Transaction ledger ------------------------------------------------------

create table if not exists public.token_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('signup_grant','purchase','consumption','refund','manual_adjust')),
  delta int not null,
  balance_after int not null,
  package_id text,                  -- 'starter'|'standard'|'pro' for purchases
  price_eur numeric(10,2),          -- for purchases
  feature text,                     -- 'agent_chat'|'deck_generate' for consumptions
  expires_at timestamptz,           -- reserved; not enforced today
  created_at timestamptz not null default now()
);

create index if not exists token_transactions_user_created_idx
  on public.token_transactions (user_id, created_at desc);

alter table public.token_transactions enable row level security;

-- Policies (no DROP IF EXISTS — re-run the CREATE only on fresh installs).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'token_transactions' and policyname = 'anon_read'
  ) then
    create policy "anon_read" on public.token_transactions for select to anon using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'token_transactions' and policyname = 'anon_insert'
  ) then
    create policy "anon_insert" on public.token_transactions for insert to anon with check (true);
  end if;
end $$;
-- No update/delete policies — the ledger is append-only.

-- 2. Atomic consume RPC ------------------------------------------------------
-- Optional but recommended: avoids the read-then-write race in src/lib/auth.ts.
-- The TS code falls back to a conditional UPDATE when this RPC is missing.
create or replace function public.consume_tokens(
  p_user_id uuid,
  p_amount int
) returns table (
  id uuid,
  username text,
  credits int,
  created_at timestamptz
)
language sql
as $$
  update public.users
  set credits = credits - p_amount
  where id = p_user_id and credits >= p_amount
  returning id, username, credits, created_at;
$$;

grant execute on function public.consume_tokens(uuid, int) to anon;

-- 3. Backfill existing users -------------------------------------------------
-- Bring any pre-existing test accounts up to the new free-grant baseline so
-- they're not locked out the moment the gate goes live.
update public.users
set credits = greatest(coalesce(credits, 0), 30)
where coalesce(credits, 0) < 30;
